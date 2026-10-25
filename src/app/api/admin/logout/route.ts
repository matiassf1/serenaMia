import { NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: Request) {
  // 303: el navegador sigue con GET a la página de login tras el POST del formulario.
  const res = NextResponse.redirect(new URL('/admin/login', req.url), 303)
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return res
}
