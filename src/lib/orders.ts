import { Prisma, type OrderStatus, type PaymentStatus } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { generateOrderCode } from '@/lib/orderCode'
import { normalizePhone } from '@/lib/phone'
import { unitPriceFor } from '@/lib/pricing'

export class OutOfStockError extends Error {
  constructor(public readonly productId: number) {
    super(`out_of_stock:${productId}`)
    this.name = 'OutOfStockError'
  }
}

export class InvalidOrderError extends Error {
  constructor(public readonly reason: string) {
    super(`invalid_order:${reason}`)
    this.name = 'InvalidOrderError'
  }
}

export type PlaceOrderInput = {
  items: { productId: number; quantity: number }[]
  customerName: string
  phone: string
  deliveryType: 'PICKUP' | 'SHIPPING'
  pickupPointId?: number
  shippingZoneId?: number
  shippingAddress?: string
  paymentMethodId: number
  wholesaleUnlocked: boolean
}

export type OrderView = {
  code: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  deliveryType: 'PICKUP' | 'SHIPPING'
  items: { productName: string; quantity: number; unitPrice: number }[]
  subtotal: number
  shippingCost: number
  total: number
  createdAt: Date
}

// Solo estos campos se leen del cliente: zod descarta cualquier precio, total o costo de envío extra.
const placeOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.number().int(), quantity: z.number().int().min(1) }))
    .min(1),
  customerName: z.string().trim().min(1).max(120),
  phone: z.string().max(40),
  deliveryType: z.enum(['PICKUP', 'SHIPPING']),
  pickupPointId: z.number().int().optional(),
  shippingZoneId: z.number().int().optional(),
  shippingAddress: z.string().trim().max(300).optional(),
  paymentMethodId: z.number().int(),
  wholesaleUnlocked: z.boolean(),
})

const MAX_CODE_ATTEMPTS = 5

function isCodeCollision(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false
  const target = e.meta?.target
  return Array.isArray(target) ? target.includes('code') : String(target ?? '').includes('code')
}

export async function placeOrder(input: PlaceOrderInput): Promise<{ id: number; code: string; total: number }> {
  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) throw new InvalidOrderError(parsed.error.issues[0]?.path.join('.') || 'payload')
  const data = parsed.data
  const phone = normalizePhone(data.phone)
  if (!phone) throw new InvalidOrderError('phone')

  // Una línea por producto, orden estable: evita doble descuento y deadlocks entre pedidos concurrentes.
  const qtyByProduct = new Map<number, number>()
  for (const it of data.items) qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + it.quantity)
  const lines = [...qtyByProduct.entries()].sort(([a], [b]) => a - b)

  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const settings = await tx.storeSettings.findUnique({ where: { id: 1 } })
        if (!settings) throw new InvalidOrderError('settings')

        const payment = await tx.paymentMethod.findFirst({ where: { id: data.paymentMethodId, active: true } })
        if (!payment) throw new InvalidOrderError('paymentMethod')

        let shippingCost = 0
        let pickupPointId: number | null = null
        let shippingZoneId: number | null = null
        let shippingAddress: string | null = null
        if (data.deliveryType === 'PICKUP') {
          if (data.pickupPointId === undefined) throw new InvalidOrderError('pickupPoint')
          const pickup = await tx.pickupPoint.findFirst({ where: { id: data.pickupPointId, active: true } })
          if (!pickup) throw new InvalidOrderError('pickupPoint')
          pickupPointId = pickup.id
        } else {
          if (data.shippingZoneId === undefined) throw new InvalidOrderError('shippingZone')
          if (!data.shippingAddress) throw new InvalidOrderError('shippingAddress')
          const zone = await tx.shippingZone.findFirst({ where: { id: data.shippingZoneId, active: true } })
          if (!zone) throw new InvalidOrderError('shippingZone')
          shippingZoneId = zone.id
          shippingCost = zone.cost
          shippingAddress = data.shippingAddress
        }

        const items: { productId: number; productName: string; unitPrice: number; quantity: number; wholesale: boolean }[] = []
        let subtotal = 0
        for (const [productId, quantity] of lines) {
          const product = await tx.product.findFirst({ where: { id: productId, active: true } })
          if (!product) throw new InvalidOrderError('product')
          // Reserva atómica: el WHERE stock >= qty se evalúa bajo el lock de la fila.
          const res = await tx.product.updateMany({
            where: { id: productId, active: true, stock: { gte: quantity } },
            data: { stock: { decrement: quantity } },
          })
          if (res.count !== 1) throw new OutOfStockError(productId)
          await tx.stockLog.create({ data: { productId, delta: -quantity, reason: 'order' } })
          const { unitPrice, wholesale } = unitPriceFor(product, quantity, data.wholesaleUnlocked, settings.wholesaleMode)
          subtotal += unitPrice * quantity
          items.push({ productId, productName: product.name, unitPrice, quantity, wholesale })
        }

        const order = await tx.order.create({
          data: {
            code: generateOrderCode(),
            customerName: data.customerName,
            phone,
            rawPhone: data.phone,
            deliveryType: data.deliveryType,
            pickupPointId,
            shippingZoneId,
            shippingAddress,
            shippingCost,
            paymentMethodId: payment.id,
            subtotal,
            total: subtotal + shippingCost,
            expiresAt: new Date(Date.now() + settings.pendingExpiryHours * 3600_000),
            items: { create: items },
          },
        })
        return { id: order.id, code: order.code, total: order.total }
      })
    } catch (e) {
      if (isCodeCollision(e) && attempt < MAX_CODE_ATTEMPTS - 1) continue
      throw e
    }
  }
}

type Tx = Prisma.TransactionClient

/** Cancela y repone stock solo si el UPDATE condicional gana (idempotente). Devuelve true si canceló. */
async function cancelInTx(tx: Tx, orderId: number, extraWhere: Prisma.OrderWhereInput = {}): Promise<boolean> {
  const res = await tx.order.updateMany({
    where: { id: orderId, status: { not: 'CANCELLED' }, ...extraWhere },
    data: { status: 'CANCELLED' },
  })
  if (res.count !== 1) return false
  const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { productId: 'asc' } })
  for (const it of items) {
    await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: it.quantity } } })
    await tx.stockLog.create({ data: { productId: it.productId, delta: it.quantity, reason: 'order_cancelled' } })
  }
  return true
}

async function assertOrderExists(orderId: number) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true } })
  if (!o) throw new InvalidOrderError('order_not_found')
}

export async function cancelOrder(orderId: number): Promise<void> {
  const cancelled = await db.$transaction((tx) => cancelInTx(tx, orderId))
  if (!cancelled) await assertOrderExists(orderId) // ya cancelado = no-op; inexistente = error
}

export async function setOrderStatus(orderId: number, status: OrderStatus): Promise<void> {
  if (status === 'CANCELLED') return cancelOrder(orderId)
  const res = await db.order.updateMany({ where: { id: orderId, status: { not: 'CANCELLED' } }, data: { status } })
  if (res.count === 1) return
  await assertOrderExists(orderId)
  throw new InvalidOrderError('order_cancelled') // un pedido cancelado repuso su stock: no se reactiva
}

export async function setPaymentStatus(orderId: number, paymentStatus: PaymentStatus): Promise<void> {
  const res = await db.order.updateMany({ where: { id: orderId }, data: { paymentStatus } })
  if (res.count !== 1) throw new InvalidOrderError('order_not_found')
}

export async function markOrderSeen(orderId: number): Promise<void> {
  await db.order.updateMany({ where: { id: orderId }, data: { isNew: false } })
}

export async function extendExpiry(orderId: number, hours: number): Promise<void> {
  const res = await db.order.updateMany({
    where: { id: orderId },
    data: { expiresAt: new Date(Date.now() + hours * 3600_000) },
  })
  if (res.count !== 1) throw new InvalidOrderError('order_not_found')
}

/** Cancela pedidos con pago pendiente y estado RECEIVED vencidos. Idempotente. Devuelve cuántos canceló. */
export async function expireStaleOrders(now: Date): Promise<number> {
  const stale = await db.order.findMany({
    where: { status: 'RECEIVED', paymentStatus: 'PENDING', expiresAt: { lte: now } },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  let count = 0
  for (const { id } of stale) {
    // Se re-chequean las condiciones dentro del UPDATE: un pago o cambio de estado entre medio gana.
    const cancelled = await db.$transaction((tx) =>
      cancelInTx(tx, id, { status: 'RECEIVED', paymentStatus: 'PENDING', expiresAt: { lte: now } }),
    )
    if (cancelled) count++
  }
  return count
}

let lastLazyExpiry = 0
const LAZY_EXPIRY_MIN_INTERVAL_MS = 60_000

/** Para rutas públicas (seguimiento): como mucho una pasada por minuto. El cron y el listado del admin ya corren `expireStaleOrders`. */
export async function expireStaleOrdersThrottled(now: Date): Promise<number> {
  const t = now.getTime()
  if (t - lastLazyExpiry < LAZY_EXPIRY_MIN_INTERVAL_MS) return 0
  lastLazyExpiry = t
  return expireStaleOrders(now)
}

export function resetExpiryThrottleForTests(): void {
  lastLazyExpiry = 0
}

/** null idéntico si no existe el código o no coincide el teléfono (spec §7). */
export async function findOrderForTracking(code: string, phone: string): Promise<OrderView | null> {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const order = await db.order.findFirst({
    where: { code: code.trim().toUpperCase(), phone: normalized },
    include: { items: { orderBy: { id: 'asc' } } },
  })
  if (!order) return null
  return {
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryType: order.deliveryType,
    items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    total: order.total,
    createdAt: order.createdAt,
  }
}
