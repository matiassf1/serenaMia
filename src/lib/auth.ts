import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { db } from '@/lib/db'

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

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET no está definida')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** Token `payload.firma`; payload = base64url({uid, exp}). `now` solo se inyecta en tests. */
export function createSession(userId: number, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: now + SESSION_MAX_AGE_S * 1000 }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** Devuelve el id de usuario si la firma y la vigencia son válidas; null en cualquier otro caso. */
export function verifySession(token: string | undefined | null): number | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!Number.isInteger(uid) || typeof exp !== 'number' || exp <= Date.now()) return null
    return uid
  } catch {
    return null
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

async function adminFromToken(token: string | undefined): Promise<AdminUser | null> {
  const id = verifySession(token)
  if (id === null) return null
  const user = await db.adminUser.findUnique({ where: { id }, select: { id: true, email: true } })
  return user
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
