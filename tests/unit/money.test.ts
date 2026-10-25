import { describe, it, expect } from 'vitest'
import { formatARS, parseARSToCentavos } from '@/lib/money'

describe('money', () => {
  it('formatARS(123450) contiene 1.234,50', () => {
    expect(formatARS(123450)).toContain('1.234,50')
  })
  it('parseARSToCentavos acepta 1.234,50', () => {
    expect(parseARSToCentavos('1.234,50')).toBe(123450)
  })
  it('parseARSToCentavos acepta 1234.5', () => {
    expect(parseARSToCentavos('1234.5')).toBe(123450)
  })
  it('parseARSToCentavos devuelve null para entradas inválidas', () => {
    expect(parseARSToCentavos('abc')).toBeNull()
    expect(parseARSToCentavos('')).toBeNull()
  })
})
