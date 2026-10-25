import { describe, it, expect } from 'vitest'
import { buildOrderWhatsAppUrl } from '@/lib/whatsapp'

describe('buildOrderWhatsAppUrl', () => {
  const url = buildOrderWhatsAppUrl('543816116380', {
    code: 'SM-ABC234',
    customerName: 'Peñaloza Ñandú',
    items: [
      { name: 'Crema & Aceite Niño', quantity: 2, unitPrice: 150000 },
      { name: 'Esmalte rosa', quantity: 1, unitPrice: 50000 },
    ],
    total: 350000,
    deliveryLabel: 'Retiro en el local',
    paymentLabel: 'Transferencia',
  })

  it('apunta a wa.me con el número del local', () => {
    expect(url.startsWith('https://wa.me/543816116380?text=')).toBe(true)
  })
  it('el texto sobrevive a encodeURIComponent (tildes, ñ, saltos de línea, &)', () => {
    const raw = url.slice('https://wa.me/543816116380?text='.length)
    expect(raw).not.toMatch(/[\s&]/)
    const text = decodeURIComponent(raw)
    expect(text).toContain('SM-ABC234')
    expect(text).toContain('Crema & Aceite Niño')
    expect(text).toContain('Peñaloza Ñandú')
    expect(text).toContain('Retiro en el local')
    expect(text).toContain('\n')
  })
  it('acepta un número con formato y lo deja solo en dígitos', () => {
    const u = buildOrderWhatsAppUrl('+54 9 381 611-6380', {
      code: 'SM-AAAAAA', customerName: 'A', items: [], total: 0, deliveryLabel: '', paymentLabel: '',
    })
    expect(u.startsWith('https://wa.me/5493816116380?text=')).toBe(true)
  })
})
