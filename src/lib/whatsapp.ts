import { formatARS } from './money'
import { normalizePhone } from './phone'

/**
 * Dígitos para wa.me: 54 + los 10 dígitos nacionales, sin el 9 de celular (wa.me/543816116380, como en la spec).
 * Acepta el número cargado con o sin +54, 9 o 0 inicial; si no se puede normalizar, solo deja los dígitos.
 */
export function whatsappDigits(shopPhone: string): string {
  const national = normalizePhone(shopPhone)
  return national ? `54${national}` : shopPhone.replace(/\D/g, '')
}

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
  return `https://wa.me/${whatsappDigits(shopPhone)}?text=${encodeURIComponent(lines.join('\n'))}`
}
