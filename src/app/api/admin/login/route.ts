import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  createSession,
  hashPassword,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rateLimit'

const WINDOW_MS = 15 * 60 * 1000
const Body = z.object({ email: z.string().min(1).max(200), password: z.string().min(1).max(200) })

// Hash descartable para que un email inexistente tarde lo mismo que uno existente.
let dummyHash: Promise<string> | undefined

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const email = parsed.data.email.trim().toLowerCase()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const allowed =
    checkRateLimit(`login:${ip}:${email}`, 5, WINDOW_MS) && checkRateLimit(`login-ip:${ip}`, 20, WINDOW_MS)
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Probá más tarde.' }, { status: 429 })
  }

  const user = await db.adminUser.findUnique({ where: { email } })
  dummyHash ??= hashPassword('dummy-password')
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash))
  if (!user || !ok) {
    return NextResponse.json({ error: 'Email o contraseña incorrectos' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, createSession(user.id), {
    ...sessionCookieOptions,
    maxAge: SESSION_MAX_AGE_S,
  })
  return res
}
