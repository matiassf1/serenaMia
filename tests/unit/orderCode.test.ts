import { describe, it, expect } from 'vitest'
import { generateOrderCode, ORDER_CODE_ALPHABET } from '@/lib/orderCode'

describe('generateOrderCode', () => {
  it('el alfabeto excluye 0 O 1 I L', () => {
    expect(ORDER_CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ')
  })
  it('cumple el formato en 5000 muestras y nunca usa 0 O 1 I L', () => {
    const re = /^SM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/
    for (let i = 0; i < 5000; i++) {
      const code = generateOrderCode()
      expect(code).toMatch(re)
      expect(code.slice(3)).not.toMatch(/[0O1IL]/)
    }
  })
  it('es determinista con rand inyectado y tolera rand() cercano a 1', () => {
    expect(generateOrderCode(() => 0)).toBe('SM-222222')
    expect(generateOrderCode(() => 0.999999)).toBe('SM-ZZZZZZ')
  })
})
