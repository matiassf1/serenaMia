import { NextResponse } from 'next/server'
import { expireStaleOrders, findOrderForTracking } from '@/lib/orders'
import { checkRateLimit } from '@/lib/rateLimit'

const WINDOW_MS = 10 * 60_000
const MAX_PER_CODE = 5
const MAX_PER_IP = 30

const NOT_FOUND = { error: 'not_found' }

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { code?: unknown; phone?: unknown } | null
  if (!body || typeof body.code !== 'string' || typeof body.phone !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const code = body.code.trim().toUpperCase()

  // Límite por IP + código (adivinar el teléfono de un pedido) y uno más amplio por IP (recorrer códigos).
  const ip = clientIp(req)
  if (!checkRateLimit(`tracking:${ip}:${code}`, MAX_PER_CODE, WINDOW_MS) || !checkRateLimit(`tracking-ip:${ip}`, MAX_PER_IP, WINDOW_MS)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(WINDOW_MS / 1000) } })
  }

  // Expiración perezosa: si venció el plazo de pago, la clienta ya ve el pedido cancelado.
  await expireStaleOrders(new Date())
  const order = await findOrderForTracking(code, body.phone)
  // Mismo status y cuerpo para código inexistente y teléfono incorrecto (spec §7).
  if (!order) return NextResponse.json(NOT_FOUND, { status: 404 })
  return NextResponse.json(order)
}
