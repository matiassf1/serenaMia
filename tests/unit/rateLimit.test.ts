import { beforeEach, describe, expect, it } from 'vitest'
import { checkRateLimit, isRateLimited, recordHit, resetRateLimitsForTests } from '@/lib/rateLimit'

beforeEach(() => resetRateLimitsForTests())

describe('rateLimit', () => {
  it('checkRateLimit permite hasta max y registra cada intento', () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit('k', 3, 1000)).toBe(true)
    expect(checkRateLimit('k', 3, 1000)).toBe(false)
  })

  it('isRateLimited no registra; recordHit sí', () => {
    for (let i = 0; i < 10; i++) expect(isRateLimited('f', 2, 1000)).toBe(false)
    recordHit('f', 1000)
    expect(isRateLimited('f', 2, 1000)).toBe(false)
    recordHit('f', 1000)
    expect(isRateLimited('f', 2, 1000)).toBe(true)
  })

  it('una clave larguísima (controlada por el atacante) no crece sin límite: se acota', () => {
    const long = 'x'.repeat(100_000)
    for (let i = 0; i < 2; i++) expect(checkRateLimit(`${long}A`, 2, 1000)).toBe(true)
    // Misma clave acotada → mismo contador, aunque el final difiera.
    expect(checkRateLimit(`${long}B`, 2, 1000)).toBe(false)
  })

  it('las claves con ventana larga no se borran por limpieza de otra ventana corta', () => {
    recordHit('long-window', 3_600_000)
    recordHit('long-window', 3_600_000)
    for (let i = 0; i < 12_000; i++) checkRateLimit(`short:${i}`, 1, 1)
    expect(isRateLimited('long-window', 2, 3_600_000)).toBe(true)
  })
})
