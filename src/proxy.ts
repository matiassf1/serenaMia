import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth'

const OPEN = new Set(['/admin/login', '/api/admin/login'])

// Chequeo optimista (solo firma y vigencia, sin base). Cada página/handler vuelve a validar con requireAdmin().
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (OPEN.has(pathname)) return NextResponse.next()
  if (verifySession(req.cookies.get(SESSION_COOKIE)?.value) !== null) return NextResponse.next()
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/admin/login', req.url))
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] }
