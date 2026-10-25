import { createHmac, timingSafeEqual } from 'node:crypto'

export const LAST_ORDER_COOKIE = 'lastOrderCode'
export const ORDER_ACCESS_MAX_AGE_S = 2 * 60 * 60

function sign(code: string, exp: number): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no está definida')
  return createHmac('sha256', secret).update(`order:${code}:${exp}`).digest('base64url')
}

/**
 * Valor de la cookie `lastOrderCode`: `CÓDIGO.vencimiento.firma`.
 * La firma (HMAC con SESSION_SECRET) hace que solo quien hizo el pedido pueda abrir /pedido/[code]:
 * conocer el código no alcanza para fabricar la cookie (spec §7).
 */
export function signOrderAccess(code: string, now = Date.now()): string {
  const normalized = code.toUpperCase()
  const exp = now + ORDER_ACCESS_MAX_AGE_S * 1000
  return `${normalized}.${exp}.${sign(normalized, exp)}`
}

/** true solo si el token fue firmado por el servidor para este código y no venció. */
export function verifyOrderAccess(token: string | undefined | null, code: string): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [tokenCode, expRaw, sig] = parts
  if (tokenCode !== code.toUpperCase() || !/^\d{1,16}$/.test(expRaw)) return false
  const exp = Number(expRaw)
  if (exp <= Date.now()) return false
  const expected = Buffer.from(sign(tokenCode, exp))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
