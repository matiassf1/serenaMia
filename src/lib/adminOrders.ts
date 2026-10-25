import type { OrderStatus, PaymentStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { expireStaleOrders } from '@/lib/orders'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  RECEIVED: 'Recibido',
  PREPARING: 'Preparando',
  READY: 'Listo',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
}

export const STATUS_FLOW: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED']

export const STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[]

export type OrderFilter = OrderStatus | 'ALL'

/** Siguiente estado del flujo, o null si ya está entregado o cancelado. */
export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(s)
  return i === -1 || i === STATUS_FLOW.length - 1 ? null : STATUS_FLOW[i + 1]
}

/** Listado para el admin. Vence perezosamente los pedidos sin pago antes de leer. */
export async function listAdminOrders(filter: OrderFilter, now = new Date()) {
  await expireStaleOrders(now)
  const [orders, newCount, grouped] = await Promise.all([
    db.order.findMany({
      where: filter === 'ALL' ? {} : { status: filter },
      orderBy: { id: 'desc' },
      include: { items: { select: { quantity: true } } },
    }),
    db.order.count({ where: { isNew: true } }),
    db.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>
  for (const g of grouped) counts[g.status] = g._count._all
  return { orders, newCount, counts }
}

const STATUS_TEXT: Record<OrderStatus, string> = {
  RECEIVED: 'recibimos tu pedido y lo estamos revisando.',
  PREPARING: 'lo estamos preparando.',
  READY: 'ya está listo para que lo retires o lo despachemos.',
  DELIVERED: 'figura como entregado. ¡Gracias por tu compra!',
  CANCELLED: 'quedó cancelado. Si querés, hacemos uno nuevo.',
}

/** Link `wa.me` hacia la clienta con un mensaje sobre el estado de su pedido. */
export function customerWhatsAppUrl(o: {
  code: string
  customerName: string
  phone: string
  status: OrderStatus
  paymentStatus: PaymentStatus
}): string {
  const first = o.customerName.trim().split(/\s+/)[0]
  const lines = [`Hola ${first}! Te escribimos de Serena Mia por tu pedido ${o.code}: ${STATUS_TEXT[o.status]}`]
  if (o.status !== 'CANCELLED') {
    lines.push(o.paymentStatus === 'PAID' ? 'Pago recibido ✔' : 'Todavía no vemos tu pago. Si ya lo hiciste, mandanos el comprobante.')
  }
  return `https://wa.me/54${o.phone.replace(/\D/g, '')}?text=${encodeURIComponent(lines.join('\n'))}`
}
