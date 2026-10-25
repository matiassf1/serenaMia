import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

export const WHOLESALE_COOKIE = 'sm_wholesale'
export const WHOLESALE_MAX_AGE_S = 60 * 60 * 24 * 30

export type WholesaleMode = 'PUBLIC' | 'CODE'

function sign(code: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no está definida')
  return createHmac('sha256', secret).update(`wholesale:${code}`).digest('base64url')
}

/** Valor de la cookie: firma del código vigente. No lleva el código; cambiarlo en el admin invalida todas las cookies. */
export function signWholesaleToken(code: string): string {
  return sign(code)
}

/** true solo si hay un código configurado y la cookie fue firmada con ese mismo código. */
export function isWholesaleUnlocked(cookieValue: string | undefined | null, currentCode: string | null | undefined): boolean {
  if (!cookieValue || !currentCode) return false
  const expected = Buffer.from(sign(currentCode))
  const given = Buffer.from(cookieValue)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Los precios mayoristas se muestran en modo PUBLIC, o en modo CODE una vez desbloqueado. */
export function wholesaleVisible(mode: WholesaleMode, unlocked: boolean): boolean {
  return mode === 'PUBLIC' || unlocked
}

export const wholesaleCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: WHOLESALE_MAX_AGE_S,
}

/** Lee la cookie mayorista del header `cookie` de un Request (route handlers). */
export function wholesaleCookieFromRequest(req: Request): string | undefined {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === WHOLESALE_COOKIE) return part.slice(i + 1).trim()
  }
  return undefined
}

export type WholesaleAccess = { mode: WholesaleMode; unlocked: boolean; visible: boolean }

/** Estado mayorista de un Request: lo que el servidor usa para decidir qué precios mostrar o aplicar. */
export async function getWholesaleAccessForRequest(req: Request): Promise<WholesaleAccess> {
  const settings = await db.storeSettings.findUnique({ where: { id: 1 }, select: { wholesaleMode: true, wholesaleCode: true } })
  const mode = settings?.wholesaleMode ?? 'PUBLIC'
  const unlocked = isWholesaleUnlocked(wholesaleCookieFromRequest(req), settings?.wholesaleCode)
  return { mode, unlocked, visible: wholesaleVisible(mode, unlocked) }
}

/** Igual, para server components. Lee cookies(): el llamador necesita su <Suspense>. */
export async function getWholesaleAccess(): Promise<WholesaleAccess & { banner: string }> {
  const jar = await cookies()
  const settings = await db.storeSettings.findUnique({
    where: { id: 1 },
    select: { wholesaleMode: true, wholesaleCode: true, wholesaleBanner: true },
  })
  const mode = settings?.wholesaleMode ?? 'PUBLIC'
  const unlocked = isWholesaleUnlocked(jar.get(WHOLESALE_COOKIE)?.value, settings?.wholesaleCode)
  return { mode, unlocked, visible: wholesaleVisible(mode, unlocked), banner: settings?.wholesaleBanner ?? '' }
}
