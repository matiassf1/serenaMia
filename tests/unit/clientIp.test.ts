import { describe, expect, it } from 'vitest'
import { clientIp } from '@/lib/clientIp'

const req = (headers: Record<string, string>) => new Request('http://localhost/x', { headers })

describe('clientIp (Railway = un solo proxy)', () => {
  it('toma la entrada MÁS A LA DERECHA de x-forwarded-for: es la que agregó el proxy', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('un prefijo inventado por el cliente no cambia la identidad', () => {
    const a = clientIp(req({ 'x-forwarded-for': '1.1.1.1, 198.51.100.7' }))
    const b = clientIp(req({ 'x-forwarded-for': '2.2.2.2, 198.51.100.7' }))
    expect(a).toBe(b)
  })

  it('un solo valor, con espacios y entradas vacías al final', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' 203.0.113.9 ' }))).toBe('203.0.113.9')
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9, ,' }))).toBe('203.0.113.9')
  })

  it('cae a x-real-ip y por último a "unknown"', () => {
    expect(clientIp(req({ 'x-real-ip': '192.0.2.1' }))).toBe('192.0.2.1')
    expect(clientIp(req({}))).toBe('unknown')
  })

  it('acota el largo del valor', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'a'.repeat(500) })).length).toBeLessThanOrEqual(64)
  })
})
