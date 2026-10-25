import { formatARS } from './money'

export function buildOrderWhatsAppUrl(
  shopPhone: string,
  o: {
    code: string
    customerName: string
    items: { name: string; quantity: number; unitPrice: number }[]
    total: number
    deliveryLabel: string
    paymentLabel: string
  },
): string {
  const lines = [
    `Hola Serena Mia! Hice el pedido ${o.code}`,
    `Nombre: ${o.customerName}`,
    '',
    ...o.items.map((i) => `• ${i.quantity} x ${i.name} — ${formatARS(i.unitPrice * i.quantity)}`),
    '',
    `Total: ${formatARS(o.total)}`,
    `Entrega: ${o.deliveryLabel}`,
    `Pago: ${o.paymentLabel}`,
  ]
  return `https://wa.me/${shopPhone.replace(/\D/g, '')}?text=${encodeURIComponent(lines.join('\n'))}`
}
