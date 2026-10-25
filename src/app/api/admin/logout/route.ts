import { NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'

export async function POST() {
  // 303: el navegador sigue con GET a la página de login tras el POST del formulario.
  // Location relativa: detrás del proxy de Railway req.url trae el host interno (localhost:8080), no el dominio público.
  const res = new NextResponse(null, { status: 303, headers: { Location: '/admin/login' } })
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return res
}
