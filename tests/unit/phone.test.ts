import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/lib/phone'

describe('normalizePhone', () => {
  it.each(['381 611-6380', '3816116380', '+54 9 381 611 6380', '0381 611-6380'])(
    'normaliza %s a 3816116380',
    (raw) => {
      expect(normalizePhone(raw)).toBe('3816116380')
    },
  )
  it('devuelve null con menos de 10 dígitos', () => {
    expect(normalizePhone('12345')).toBeNull()
  })
})
