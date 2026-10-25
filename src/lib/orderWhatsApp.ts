import { db } from '@/lib/db'
import { buildOrderWhatsAppUrl } from '@/lib/whatsapp'

/** Pedido listo para mostrar en la confirmación y armar el mensaje de WhatsApp. Null si no existe. */
export async function loadOrderConfirmation(where: { id: number } | { code: string }) {
  const [order, settings] = await Promise.all([
    db.order.findUnique({
      where,
      include: { items: { orderBy: { id: 'asc' } }, paymentMethod: true, pickupPoint: true, shippingZone: true },
    }),
    db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
  ])
  if (!order) return null
  const deliveryLabel =
    order.deliveryType === 'PICKUP'
      ? `Retiro en ${order.pickupPoint?.name ?? 'el local'}`
      : `Envío a ${order.shippingAddress ?? ''} (${order.shippingZone?.name ?? ''})`
  const whatsappUrl = buildOrderWhatsAppUrl(settings.whatsapp, {
    code: order.code,
    customerName: order.customerName,
    items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
    total: order.total,
    deliveryLabel,
    paymentLabel: order.paymentMethod.name,
  })
  return { order, deliveryLabel, whatsappUrl }
}
