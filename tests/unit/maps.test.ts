import { describe, expect, it } from 'vitest'
import { mapsHref } from '@/lib/maps'

describe('mapsHref ("Cómo llegar")', () => {
  it('usa el link del admin si está cargado', () => {
    expect(mapsHref('https://maps.app.goo.gl/abc', 'Calle 1')).toBe('https://maps.app.goo.gl/abc')
  })

  it('si mapsUrl está vacío o son espacios, cae a una búsqueda de Google Maps con la dirección', () => {
    const expected = 'https://www.google.com/maps/search/?api=1&query=Av.%20Mate%20de%20Luna%201234%2C%20San%20Miguel%20de%20Tucum%C3%A1n'
    expect(mapsHref('', 'Av. Mate de Luna 1234, San Miguel de Tucumán')).toBe(expected)
    expect(mapsHref('   ', 'Av. Mate de Luna 1234, San Miguel de Tucumán')).toBe(expected)
    expect(mapsHref(null, 'Av. Mate de Luna 1234, San Miguel de Tucumán')).toBe(expected)
  })

  it('escapa caracteres que romperían la URL', () => {
    expect(mapsHref('', 'A&B #1?')).toBe('https://www.google.com/maps/search/?api=1&query=A%26B%20%231%3F')
  })

  it('nunca devuelve un href vacío', () => {
    expect(mapsHref('', '')).toMatch(/^https:\/\/www\.google\.com\/maps/)
  })
})
