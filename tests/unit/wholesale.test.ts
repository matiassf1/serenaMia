import { describe, expect, it } from 'vitest'
import { isWholesaleUnlocked, signWholesaleToken, wholesaleVisible } from '@/lib/wholesale'

describe('signWholesaleToken / isWholesaleUnlocked', () => {
  it('la cookie firmada con el código actual desbloquea', () => {
    expect(isWholesaleUnlocked(signWholesaleToken('SALON2026'), 'SALON2026')).toBe(true)
  })

  it('cambiar el código invalida la cookie vieja', () => {
    const old = signWholesaleToken('SALON2026')
    expect(isWholesaleUnlocked(old, 'OTRO-CODIGO')).toBe(false)
  })

  it('sin cookie, cookie basura o cookie vacía no desbloquean', () => {
    expect(isWholesaleUnlocked(undefined, 'SALON2026')).toBe(false)
    expect(isWholesaleUnlocked('', 'SALON2026')).toBe(false)
    expect(isWholesaleUnlocked('cualquier-cosa', 'SALON2026')).toBe(false)
    expect(isWholesaleUnlocked(`${signWholesaleToken('SALON2026')}x`, 'SALON2026')).toBe(false)
  })

  it('sin código configurado (null o vacío) nunca desbloquea, ni con un token firmado sobre ""', () => {
    expect(isWholesaleUnlocked(signWholesaleToken(''), '')).toBe(false)
    expect(isWholesaleUnlocked(signWholesaleToken('x'), null)).toBe(false)
    expect(isWholesaleUnlocked(signWholesaleToken('x'), undefined)).toBe(false)
  })

  it('el token no contiene el código', () => {
    expect(signWholesaleToken('SALON2026')).not.toContain('SALON2026')
  })
})

describe('wholesaleVisible', () => {
  it('modo PUBLIC siempre se ve; modo CODE solo con desbloqueo', () => {
    expect(wholesaleVisible('PUBLIC', false)).toBe(true)
    expect(wholesaleVisible('CODE', false)).toBe(false)
    expect(wholesaleVisible('CODE', true)).toBe(true)
  })
})
