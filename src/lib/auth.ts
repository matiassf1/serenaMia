import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { db } from '@/lib/db'
import { getSessionSecret } from '@/lib/secrets'

export const SESSION_COOKIE = 'sm_admin'
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7

export type AdminUser = { id: number; email: string }

const BCRYPT_ROUNDS = 12

export function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, BCRYPT_ROUNDS)
}

export function verifyPassword(p: string, hash: string): Promise<boolean> {
  return bcrypt.compare(p, hash)
}

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
}

/** Huella del hash de contraseña vigente: cambiar la contraseña cambia la huella e invalida las sesiones emitidas. */
function passwordVersion(passwordHash: string): string {
  return createHmac('sha256', getSessionSecret()).update(`pwv:${passwordHash}`).digest('base64url').slice(0, 22)
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Token `payload.firma`; payload = base64url({uid, exp, v}). `now` solo se inyecta en tests. */
export function createSession(userId: number, passwordHash: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: now + SESSION_MAX_AGE_S * 1000, v: passwordVersion(passwordHash) }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function readSession(token: string | undefined | null): { uid: number; v: unknown } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  if (!safeEqual(sign(payload), sig)) return null
  try {
    const { uid, exp, v } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!Number.isInteger(uid) || typeof exp !== 'number' || exp <= Date.now()) return null
    return { uid, v }
  } catch {
    return null
  }
}

/**
 * Devuelve el id de usuario si la firma y la vigencia son válidas; null en cualquier otro caso.
 * No mira la base, así que NO conoce la versión de la contraseña: lo usa el proxy como chequeo optimista.
 * La validación completa (usuario existente y contraseña sin cambios) es `getAdminFromRequest` / `requireAdmin`.
 */
export function verifySession(token: string | undefined | null): number | null {
  return readSession(token)?.uid ?? null
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

async function adminFromToken(token: string | undefined): Promise<AdminUser | null> {
  const session = readSession(token)
  if (!session) return null
  const user = await db.adminUser.findUnique({ where: { id: session.uid }, select: { id: true, email: true, passwordHash: true } })
  // Sesión de otra contraseña (o formato viejo sin versión): no entra.
  if (!user || typeof session.v !== 'string' || !safeEqual(session.v, passwordVersion(user.passwordHash))) return null
  return { id: user.id, email: user.email }
}

export function getAdminFromRequest(req: Request): Promise<AdminUser | null> {
  return adminFromToken(readCookie(req.headers.get('cookie'), SESSION_COOKIE))
}

/** Para server components y route handlers: devuelve el admin o redirige al login. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')
  return admin
}

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const jar = await cookies()
  await connection() // verifySession usa Date.now(): obliga a renderizar en cada request (cacheComponents)
  return adminFromToken(jar.get(SESSION_COOKIE)?.value)
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}
