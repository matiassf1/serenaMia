import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clientIp } from '@/lib/clientIp'
import { checkRateLimit, isRateLimited, recordHit } from '@/lib/rateLimit'
import { WHOLESALE_COOKIE, signWholesaleToken, wholesaleCookieOptions } from '@/lib/wholesale'

const WINDOW_MS = 10 * 60_000
const MAX_PER_IP = 10
// Tope global de intentos fallidos, sin importar la IP: el código lo eligió una persona y puede ser corto.
const GLOBAL_WINDOW_MS = 60 * 60_000
const MAX_GLOBAL_FAILURES = 30
const GLOBAL_KEY = 'wholesale-fail-global'

const digest = (s: string) => createHash('sha256').update(s.trim().toLowerCase()).digest()

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  // Todos los intentos cuentan, también los correctos: el límite frena la adivinanza del código.
  if (isRateLimited(GLOBAL_KEY, MAX_GLOBAL_FAILURES, GLOBAL_WINDOW_MS) || !checkRateLimit(`wholesale:${clientIp(req)}`, MAX_PER_IP, WINDOW_MS)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(WINDOW_MS / 1000) } })
  }

  const settings = await db.storeSettings.findUnique({ where: { id: 1 }, select: { wholesaleMode: true, wholesaleCode: true } })
  const stored = settings?.wholesaleCode?.trim()
  const given = typeof body.code === 'string' ? body.code : ''
  const ok =
    settings?.wholesaleMode === 'CODE' &&
    !!stored &&
    given.trim() !== '' &&
    timingSafeEqual(digest(given), digest(stored))
  if (!ok) {
    recordHit(GLOBAL_KEY, GLOBAL_WINDOW_MS)
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(WHOLESALE_COOKIE, signWholesaleToken(settings!.wholesaleCode as string), wholesaleCookieOptions)
  return res
}
