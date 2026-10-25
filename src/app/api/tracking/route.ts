import { NextResponse } from 'next/server'
import { clientIp } from '@/lib/clientIp'
import { ORDER_CODE_ALPHABET } from '@/lib/orderCode'
import { expireStaleOrdersThrottled, findOrderForTracking } from '@/lib/orders'
import { checkRateLimit, isRateLimited, recordHit } from '@/lib/rateLimit'

const WINDOW_MS = 10 * 60_000
const MAX_PER_CODE = 5
const MAX_PER_IP = 30
// Tope por código sin importar la IP: frena la adivinanza del teléfono aunque el atacante rote de IP.
const CODE_WINDOW_MS = 60 * 60_000
const MAX_WRONG_PER_CODE = 5
const MAX_PHONE_LENGTH = 40
const CODE_FORMAT = new RegExp(`^SM-[${ORDER_CODE_ALPHABET}]{6}$`)

const NOT_FOUND = { error: 'not_found' }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { code?: unknown; phone?: unknown } | null
  if (!body || typeof body.code !== 'string' || typeof body.phone !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const code = body.code.trim().toUpperCase()
  // Un código con formato imposible (o un teléfono enorme) no puede existir: mismo 404 y sin tocar contadores ni base.
  if (!CODE_FORMAT.test(code) || body.phone.length > MAX_PHONE_LENGTH) return NextResponse.json(NOT_FOUND, { status: 404 })

  // Límite por IP + código (adivinar el teléfono de un pedido) y uno más amplio por IP (recorrer códigos).
  const ip = clientIp(req)
  const codeKey = `tracking-wrong:${code}`
  if (
    isRateLimited(codeKey, MAX_WRONG_PER_CODE, CODE_WINDOW_MS) ||
    !checkRateLimit(`tracking:${ip}:${code}`, MAX_PER_CODE, WINDOW_MS) ||
    !checkRateLimit(`tracking-ip:${ip}`, MAX_PER_IP, WINDOW_MS)
  ) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(CODE_WINDOW_MS / 1000) } })
  }

  // Expiración perezosa (como mucho una vez por minuto; el cron y el listado del admin también la corren).
  await expireStaleOrdersThrottled(new Date())
  const order = await findOrderForTracking(code, body.phone)
  // Mismo status y cuerpo para código inexistente y teléfono incorrecto (spec §7).
  if (!order) {
    recordHit(codeKey, CODE_WINDOW_MS)
    return NextResponse.json(NOT_FOUND, { status: 404 })
  }
  return NextResponse.json(order)
}
