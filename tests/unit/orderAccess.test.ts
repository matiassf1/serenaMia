import { describe, expect, it } from 'vitest'
import { ORDER_ACCESS_MAX_AGE_S, signOrderAccess, verifyOrderAccess } from '@/lib/orderAccess'

process.env.SESSION_SECRET ??= 'test-secret-order-access'

describe('cookie de acceso a /pedido/[code]', () => {
  it('un token firmado para el código lo habilita; empieza con el código', () => {
    const token = signOrderAccess('SM-ABCD23')
    expect(token.startsWith('SM-ABCD23.')).toBe(true)
    expect(verifyOrderAccess(token, 'SM-ABCD23')).toBe(true)
  })

  it('compara el código sin importar mayúsculas (la URL puede venir en minúsculas)', () => {
    expect(verifyOrderAccess(signOrderAccess('SM-ABCD23'), 'sm-abcd23')).toBe(true)
  })

  it('una cookie falsificada con el código a secas NO da acceso', () => {
    expect(verifyOrderAccess('SM-ABCD23', 'SM-ABCD23')).toBe(false)
  })

  it('rechaza firma inventada, código cambiado, vencimiento extendido y basura', () => {
    const token = signOrderAccess('SM-ABCD23')
    const [code, exp, sig] = token.split('.')
    expect(verifyOrderAccess(`${code}.${exp}.${'A'.repeat(sig.length)}`, 'SM-ABCD23')).toBe(false)
    expect(verifyOrderAccess(`SM-ZZZZZZ.${exp}.${sig}`, 'SM-ZZZZZZ')).toBe(false)
    expect(verifyOrderAccess(token, 'SM-ZZZZZZ')).toBe(false) // firmado para otro pedido
    expect(verifyOrderAccess(`${code}.${Number(exp) + 1e9}.${sig}`, 'SM-ABCD23')).toBe(false)
    for (const junk of ['', 'a.b', 'a.b.c.d', `${code}.x.${sig}`, undefined, null]) {
      expect(verifyOrderAccess(junk as string, 'SM-ABCD23')).toBe(false)
    }
  })

  it('un token vencido no sirve', () => {
    const now = Date.now()
    const old = signOrderAccess('SM-ABCD23', now - (ORDER_ACCESS_MAX_AGE_S + 5) * 1000)
    expect(verifyOrderAccess(old, 'SM-ABCD23')).toBe(false)
    expect(verifyOrderAccess(signOrderAccess('SM-ABCD23', now - 60_000), 'SM-ABCD23')).toBe(true)
  })
})
