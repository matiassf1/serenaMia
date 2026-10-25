import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { seed } from '../../prisma/seed'
import { resetDb } from './helpers'
import {
  InvalidOrderError,
  OutOfStockError,
  cancelOrder,
  expireStaleOrders,
  extendExpiry,
  findOrderForTracking,
  markOrderSeen,
  placeOrder,
  setOrderStatus,
  setPaymentStatus,
  type PlaceOrderInput,
} from '@/lib/orders'
import { logAudit } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rateLimit'

type Ids = {
  product: number
  wholesaleProduct: number
  inactiveProduct: number
  payment: number
  inactivePayment: number
  pickup: number
  inactivePickup: number
  zone: number
  inactiveZone: number
}

let ids: Ids

async function stockOf(productId: number) {
  return (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock
}

function baseInput(over: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    items: [{ productId: ids.product, quantity: 2 }],
    customerName: 'Ana Pérez',
    phone: '381 611-6380',
    deliveryType: 'PICKUP',
    pickupPointId: ids.pickup,
    paymentMethodId: ids.payment,
    wholesaleUnlocked: false,
    ...over,
  }
}

beforeEach(async () => {
  await resetDb()
  await seed(db)
  const cat = await db.category.findFirstOrThrow()
  const mk = (name: string, extra: object = {}) =>
    db.product.create({
      data: { name, slug: name.toLowerCase().replace(/\s+/g, '-'), categoryId: cat.id, retailPrice: 10000, stock: 10, ...extra },
    })
  const product = await mk('Test Retail')
  const wholesaleProduct = await mk('Test Mayorista', { wholesalePrice: 8000, wholesaleMinQty: 5 })
  const inactiveProduct = await mk('Test Inactivo', { active: false })
  const payment = await db.paymentMethod.create({ data: { name: 'Test Pago', active: true } })
  const inactivePayment = await db.paymentMethod.create({ data: { name: 'Test Pago Off', active: false } })
  const pickup = await db.pickupPoint.create({ data: { name: 'Test Retiro', address: 'X 1', active: true } })
  const inactivePickup = await db.pickupPoint.create({ data: { name: 'Test Retiro Off', address: 'X 2', active: false } })
  const zone = await db.shippingZone.create({ data: { name: 'Test Zona', cost: 150000, active: true } })
  const inactiveZone = await db.shippingZone.create({ data: { name: 'Test Zona Off', cost: 1, active: false } })
  ids = {
    product: product.id,
    wholesaleProduct: wholesaleProduct.id,
    inactiveProduct: inactiveProduct.id,
    payment: payment.id,
    inactivePayment: inactivePayment.id,
    pickup: pickup.id,
    inactivePickup: inactivePickup.id,
    zone: zone.id,
    inactiveZone: inactiveZone.id,
  }
})

afterAll(async () => {
  await db.$disconnect()
})

describe('placeOrder', () => {
  it('ignora precios, total y envío enviados por el cliente (payload manipulado)', async () => {
    const tampered = { ...baseInput(), unitPrice: 1, total: 1, shippingCost: 0, subtotal: 1 } as PlaceOrderInput
    const res = await placeOrder(tampered)
    expect(res.total).toBe(20000)
    const order = await db.order.findUniqueOrThrow({ where: { id: res.id }, include: { items: true } })
    expect(order.total).toBe(20000)
    expect(order.subtotal).toBe(20000)
    expect(order.shippingCost).toBe(0)
    expect(order.items[0].unitPrice).toBe(10000)
  })

  it('calcula el envío desde la zona en la base, no desde el cliente', async () => {
    const input = { ...baseInput({ deliveryType: 'SHIPPING', shippingZoneId: ids.zone, shippingAddress: 'Calle 123', pickupPointId: undefined }), shippingCost: 0 } as PlaceOrderInput
    const res = await placeOrder(input)
    expect(res.total).toBe(20000 + 150000)
    const order = await db.order.findUniqueOrThrow({ where: { id: res.id } })
    expect(order.shippingCost).toBe(150000)
    expect(order.pickupPointId).toBeNull()
  })

  it('aplica precio mayorista con modo PUBLIC al alcanzar el mínimo', async () => {
    const res = await placeOrder(baseInput({ items: [{ productId: ids.wholesaleProduct, quantity: 5 }] }))
    expect(res.total).toBe(5 * 8000)
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: res.id } })
    expect(item.wholesale).toBe(true)
  })

  it('en modo CODE sin desbloqueo cobra retail', async () => {
    await db.storeSettings.update({ where: { id: 1 }, data: { wholesaleMode: 'CODE', wholesaleCode: 'abc' } })
    const res = await placeOrder(baseInput({ items: [{ productId: ids.wholesaleProduct, quantity: 5 }] }))
    expect(res.total).toBe(5 * 10000)
  })

  it.each([0, -1, 1.5, NaN])('rechaza cantidad %s', async (quantity) => {
    await expect(placeOrder(baseInput({ items: [{ productId: ids.product, quantity }] }))).rejects.toBeInstanceOf(InvalidOrderError)
    expect(await stockOf(ids.product)).toBe(10)
  })

  it('rechaza carrito vacío', async () => {
    await expect(placeOrder(baseInput({ items: [] }))).rejects.toBeInstanceOf(InvalidOrderError)
  })

  it('rechaza producto inexistente', async () => {
    await expect(placeOrder(baseInput({ items: [{ productId: 999999, quantity: 1 }] }))).rejects.toBeInstanceOf(InvalidOrderError)
  })

  it('rechaza producto inactivo y no toca su stock', async () => {
    await expect(placeOrder(baseInput({ items: [{ productId: ids.inactiveProduct, quantity: 1 }] }))).rejects.toBeInstanceOf(InvalidOrderError)
    expect(await stockOf(ids.inactiveProduct)).toBe(10)
  })

  it('rechaza el mismo producto repetido que superaría el stock sin dejar stock negativo', async () => {
    await expect(
      placeOrder(baseInput({ items: [{ productId: ids.product, quantity: 6 }, { productId: ids.product, quantity: 6 }] })),
    ).rejects.toBeInstanceOf(OutOfStockError)
    expect(await stockOf(ids.product)).toBe(10)
  })

  it('rechaza medio de pago inactivo o inexistente', async () => {
    await expect(placeOrder(baseInput({ paymentMethodId: ids.inactivePayment }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(baseInput({ paymentMethodId: 999999 }))).rejects.toBeInstanceOf(InvalidOrderError)
  })

  it('rechaza punto de retiro inactivo, inexistente u omitido', async () => {
    await expect(placeOrder(baseInput({ pickupPointId: ids.inactivePickup }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(baseInput({ pickupPointId: 999999 }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(baseInput({ pickupPointId: undefined }))).rejects.toBeInstanceOf(InvalidOrderError)
  })

  it('rechaza zona de envío inactiva, inexistente u omitida, y envío sin dirección', async () => {
    const ship = (o: Partial<PlaceOrderInput>) =>
      baseInput({ deliveryType: 'SHIPPING', pickupPointId: undefined, shippingZoneId: ids.zone, shippingAddress: 'Calle 1', ...o })
    await expect(placeOrder(ship({ shippingZoneId: ids.inactiveZone }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(ship({ shippingZoneId: 999999 }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(ship({ shippingZoneId: undefined }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(ship({ shippingAddress: undefined }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(ship({ shippingAddress: '   ' }))).rejects.toBeInstanceOf(InvalidOrderError)
  })

  it('rechaza teléfono inválido y nombre vacío', async () => {
    await expect(placeOrder(baseInput({ phone: '12345' }))).rejects.toBeInstanceOf(InvalidOrderError)
    await expect(placeOrder(baseInput({ customerName: '  ' }))).rejects.toBeInstanceOf(InvalidOrderError)
  })

  it('descuenta stock, crea StockLog, expiresAt y guarda teléfono normalizado y crudo', async () => {
    await db.storeSettings.update({ where: { id: 1 }, data: { pendingExpiryHours: 48 } })
    const before = Date.now()
    const res = await placeOrder(baseInput())
    const after = Date.now()
    expect(res.code).toMatch(/^SM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
    expect(await stockOf(ids.product)).toBe(8)
    const logs = await db.stockLog.findMany({ where: { productId: ids.product } })
    expect(logs).toHaveLength(1)
    expect(logs[0].delta).toBe(-2)
    const order = await db.order.findUniqueOrThrow({ where: { id: res.id } })
    expect(order.phone).toBe('3816116380')
    expect(order.rawPhone).toBe('381 611-6380')
    expect(order.status).toBe('RECEIVED')
    expect(order.paymentStatus).toBe('PENDING')
    expect(order.isNew).toBe(true)
    const h48 = 48 * 3600_000
    expect(order.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + h48 - 1000)
    expect(order.expiresAt!.getTime()).toBeLessThanOrEqual(after + h48 + 1000)
  })

  it('respeta pendingExpiryHours configurado', async () => {
    await db.storeSettings.update({ where: { id: 1 }, data: { pendingExpiryHours: 12 } })
    const before = Date.now()
    const res = await placeOrder(baseInput())
    const order = await db.order.findUniqueOrThrow({ where: { id: res.id } })
    expect(order.expiresAt!.getTime()).toBeLessThanOrEqual(before + 12 * 3600_000 + 5000)
  })

  it('si una línea falla por stock, no se descuenta ninguna (transacción atómica)', async () => {
    await expect(
      placeOrder(baseInput({ items: [{ productId: ids.product, quantity: 1 }, { productId: ids.wholesaleProduct, quantity: 11 }] })),
    ).rejects.toMatchObject({ name: 'OutOfStockError', productId: ids.wholesaleProduct })
    expect(await stockOf(ids.product)).toBe(10)
    expect(await db.order.count()).toBe(0)
    expect(await db.stockLog.count()).toBe(0)
  })

  it('concurrencia: con stock=1 dos pedidos simultáneos → uno gana y el otro recibe OutOfStockError', async () => {
    await db.product.update({ where: { id: ids.product }, data: { stock: 1 } })
    const attempt = () => placeOrder(baseInput({ items: [{ productId: ids.product, quantity: 1 }] }))
    const results = await Promise.allSettled([attempt(), attempt()])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0].reason).toBeInstanceOf(OutOfStockError)
    expect((failed[0].reason as OutOfStockError).productId).toBe(ids.product)
    expect(await stockOf(ids.product)).toBe(0)
    expect(await db.order.count()).toBe(1)
  })

  it('concurrencia: 10 pedidos simultáneos con stock=3 → exactamente 3 ganan', async () => {
    await db.product.update({ where: { id: ids.product }, data: { stock: 3 } })
    const attempt = () => placeOrder(baseInput({ items: [{ productId: ids.product, quantity: 1 }] }))
    const results = await Promise.allSettled(Array.from({ length: 10 }, attempt))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    expect(await stockOf(ids.product)).toBe(0)
  })
})

describe('cancelOrder', () => {
  it('repone stock y escribe StockLog; llamado dos veces no repone dos veces', async () => {
    const { id } = await placeOrder(baseInput())
    expect(await stockOf(ids.product)).toBe(8)
    await cancelOrder(id)
    expect(await stockOf(ids.product)).toBe(10)
    await cancelOrder(id)
    expect(await stockOf(ids.product)).toBe(10)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED')
    const logs = await db.stockLog.findMany({ where: { productId: ids.product }, orderBy: { id: 'asc' } })
    expect(logs.map((l) => l.delta)).toEqual([-2, 2])
  })

  it('cancelaciones concurrentes reponen una sola vez', async () => {
    const { id } = await placeOrder(baseInput())
    await Promise.allSettled([cancelOrder(id), cancelOrder(id), cancelOrder(id)])
    expect(await stockOf(ids.product)).toBe(10)
  })
})

describe('expireStaleOrders', () => {
  it('cancela vencidos y repone stock; la segunda corrida devuelve 0 y no cambia el stock', async () => {
    const { id } = await placeOrder(baseInput())
    const future = new Date(Date.now() + 49 * 3600_000)
    expect(await expireStaleOrders(future)).toBe(1)
    expect(await stockOf(ids.product)).toBe(10)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED')
    expect(await expireStaleOrders(future)).toBe(0)
    expect(await stockOf(ids.product)).toBe(10)
  })

  it('no cancela pedidos aún no vencidos', async () => {
    await placeOrder(baseInput())
    expect(await expireStaleOrders(new Date())).toBe(0)
    expect(await stockOf(ids.product)).toBe(8)
  })

  it('no toca pedidos PAID ni PREPARING', async () => {
    const paid = await placeOrder(baseInput())
    const preparing = await placeOrder(baseInput())
    await setPaymentStatus(paid.id, 'PAID')
    await setOrderStatus(preparing.id, 'PREPARING')
    const future = new Date(Date.now() + 49 * 3600_000)
    expect(await expireStaleOrders(future)).toBe(0)
    expect(await stockOf(ids.product)).toBe(6)
    expect((await db.order.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe('RECEIVED')
    expect((await db.order.findUniqueOrThrow({ where: { id: preparing.id } })).status).toBe('PREPARING')
  })

  it('corridas concurrentes reponen stock una sola vez', async () => {
    await placeOrder(baseInput())
    const future = new Date(Date.now() + 49 * 3600_000)
    await Promise.all([expireStaleOrders(future), expireStaleOrders(future)])
    expect(await stockOf(ids.product)).toBe(10)
  })
})

describe('extendExpiry', () => {
  it('mueve expiresAt a now + horas y evita la expiración', async () => {
    const { id } = await placeOrder(baseInput())
    const before = Date.now()
    await extendExpiry(id, 100)
    const order = await db.order.findUniqueOrThrow({ where: { id } })
    expect(order.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 100 * 3600_000 - 1000)
    expect(await expireStaleOrders(new Date(Date.now() + 49 * 3600_000))).toBe(0)
  })
})

describe('estado y marcas del pedido', () => {
  it('setOrderStatus y setPaymentStatus actualizan el pedido', async () => {
    const { id } = await placeOrder(baseInput())
    await setOrderStatus(id, 'READY')
    await setPaymentStatus(id, 'PAID')
    const o = await db.order.findUniqueOrThrow({ where: { id } })
    expect([o.status, o.paymentStatus]).toEqual(['READY', 'PAID'])
  })

  it('setOrderStatus CANCELLED repone stock una vez (delegando en cancelOrder)', async () => {
    const { id } = await placeOrder(baseInput())
    await setOrderStatus(id, 'CANCELLED')
    await setOrderStatus(id, 'CANCELLED')
    expect(await stockOf(ids.product)).toBe(10)
  })

  it('un pedido cancelado no puede reactivarse', async () => {
    const { id } = await placeOrder(baseInput())
    await cancelOrder(id)
    await expect(setOrderStatus(id, 'PREPARING')).rejects.toBeInstanceOf(InvalidOrderError)
    expect(await stockOf(ids.product)).toBe(10)
  })

  it('setPaymentStatus rechaza un pedido cancelado con order_cancelled y no lo marca pagado', async () => {
    const { id } = await placeOrder(baseInput())
    await cancelOrder(id)
    await expect(setPaymentStatus(id, 'PAID')).rejects.toMatchObject({ name: 'InvalidOrderError', reason: 'order_cancelled' })
    expect((await db.order.findUniqueOrThrow({ where: { id } })).paymentStatus).toBe('PENDING')
  })

  it('setPaymentStatus sobre un pedido inexistente sigue siendo order_not_found', async () => {
    await expect(setPaymentStatus(999999, 'PAID')).rejects.toMatchObject({ reason: 'order_not_found' })
  })

  it('markOrderSeen limpia isNew', async () => {
    const { id } = await placeOrder(baseInput())
    await markOrderSeen(id)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).isNew).toBe(false)
  })
})

describe('findOrderForTracking', () => {
  it.each(['381 611-6380', '3816116380', '+54 9 381 611 6380', '0381 611-6380'])('coincide con el teléfono %s', async (phone) => {
    const { code } = await placeOrder(baseInput())
    const view = await findOrderForTracking(code, phone)
    expect(view).not.toBeNull()
    expect(view!.code).toBe(code)
    expect(view!.status).toBe('RECEIVED')
    expect(view!.paymentStatus).toBe('PENDING')
    expect(view!.deliveryType).toBe('PICKUP')
    expect(view!.items).toEqual([{ productName: 'Test Retail', quantity: 2, unitPrice: 10000 }])
    expect(view!.subtotal).toBe(20000)
    expect(view!.total).toBe(20000)
  })

  it('devuelve null idéntico para código inexistente y teléfono incorrecto', async () => {
    const { code } = await placeOrder(baseInput())
    const wrongPhone = await findOrderForTracking(code, '381 600-0000')
    const wrongCode = await findOrderForTracking('SM-ZZZZZZ', '381 611-6380')
    const badPhone = await findOrderForTracking(code, '123')
    expect(wrongPhone).toBeNull()
    expect(wrongCode).toBeNull()
    expect(badPhone).toBeNull()
  })

  it('no expone datos sensibles (teléfono, nombre, dirección)', async () => {
    const { code } = await placeOrder(baseInput())
    const view = await findOrderForTracking(code, '3816116380')
    expect(Object.keys(view!).sort()).toEqual(
      ['code', 'createdAt', 'deliveryType', 'items', 'paymentStatus', 'shippingCost', 'status', 'subtotal', 'total'].sort(),
    )
  })
})

describe('logAudit', () => {
  it('registra quién, qué y antes/después', async () => {
    await logAudit('elias@example.com', 'product.price', 'Product', '7', { retailPrice: 100 }, { retailPrice: 110 })
    const row = await db.auditLog.findFirstOrThrow()
    expect(row).toMatchObject({
      adminEmail: 'elias@example.com',
      action: 'product.price',
      entity: 'Product',
      entityId: '7',
      before: { retailPrice: 100 },
      after: { retailPrice: 110 },
    })
  })

  it('acepta before/after nulos', async () => {
    await logAudit('a@b.c', 'create', 'Product', '1', null, { x: 1 })
    const row = await db.auditLog.findFirstOrThrow()
    expect(row.before).toBeNull()
  })
})

describe('checkRateLimit', () => {
  it('permite hasta max intentos en la ventana y bloquea el siguiente', () => {
    const key = `k-${Math.random()}`
    for (let i = 0; i < 5; i++) expect(checkRateLimit(key, 5, 60_000)).toBe(true)
    expect(checkRateLimit(key, 5, 60_000)).toBe(false)
  })

  it('las claves son independientes', () => {
    const a = `a-${Math.random()}`
    for (let i = 0; i < 5; i++) checkRateLimit(a, 5, 60_000)
    expect(checkRateLimit(`b-${Math.random()}`, 5, 60_000)).toBe(true)
  })

  it('la ventana expira', async () => {
    const key = `w-${Math.random()}`
    expect(checkRateLimit(key, 1, 30)).toBe(true)
    expect(checkRateLimit(key, 1, 30)).toBe(false)
    await new Promise((r) => setTimeout(r, 50))
    expect(checkRateLimit(key, 1, 30)).toBe(true)
  })
})
