import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  createSession,
  getAdminFromRequest,
  hashPassword,
  verifyPassword,
  verifySession,
  SESSION_COOKIE,
} from '@/lib/auth'
import { proxy } from '@/proxy'
import { POST as login } from '@/app/api/admin/login/route'
import { POST as logout } from '@/app/api/admin/logout/route'
import { resetRateLimitsForTests } from '@/lib/rateLimit'
import { resetDb } from './helpers'

const PASSWORD = 'clave-segura-123'
let ipCounter = 0

function loginReq(email: string, password: string, ip = `10.0.0.${++ipCounter}`) {
  return new Request('http://localhost/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password }),
  })
}

async function makeAdmin(email = 'elias@serenamia.test') {
  return db.adminUser.create({ data: { email, passwordHash: await hashPassword(PASSWORD) } })
}

beforeEach(async () => {
  resetRateLimitsForTests()
  await resetDb()
})

describe('hash de contraseñas', () => {
  it('nunca guarda la contraseña en claro y verifica correcto/incorrecto', async () => {
    const admin = await makeAdmin()
    const stored = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id } })
    expect(stored.passwordHash).not.toContain(PASSWORD)
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(await verifyPassword(PASSWORD, stored.passwordHash)).toBe(true)
    expect(await verifyPassword('otra-clave', stored.passwordHash)).toBe(false)
  })
})

describe('sesión firmada', () => {
  it('round-trip del token', () => {
    expect(verifySession(createSession(42, 'hash-a'))).toBe(42)
  })

  it('rechaza token manipulado, firma ajena, basura y vencido', () => {
    const token = createSession(1, 'hash-a')
    const [payload, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ uid: 2, exp: Date.now() + 1e9 })).toString('base64url')
    expect(verifySession(`${forged}.${sig}`)).toBeNull()
    expect(verifySession(`${payload}.${sig.slice(0, -2)}AA`)).toBeNull()
    expect(verifySession(payload)).toBeNull()
    expect(verifySession('')).toBeNull()
    expect(verifySession('a.b.c')).toBeNull()
    const expired = createSession(1, 'hash-a', Date.now() - 8 * 24 * 3600 * 1000)
    expect(verifySession(expired)).toBeNull()
  })
})

describe('POST /api/admin/login', () => {
  it('contraseña correcta → 200 y cookie httpOnly sameSite=lax', async () => {
    const admin = await makeAdmin()
    const res = await login(loginReq(admin.email, PASSWORD))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${SESSION_COOKIE}=`)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(cookie).toContain('Path=/')
    const token = /sm_admin=([^;]+)/.exec(cookie)![1]
    expect(verifySession(token)).toBe(admin.id)
  })

  it('contraseña incorrecta y usuario inexistente → mismo 401 y mismo body, sin cookie', async () => {
    const admin = await makeAdmin()
    const a = await login(loginReq(admin.email, 'mala'))
    const b = await login(loginReq('nadie@serenamia.test', 'mala'))
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(await a.text()).toBe(await b.text())
    expect(a.headers.get('set-cookie')).toBeNull()
  })

  it('body inválido → 400', async () => {
    const res = await login(
      new Request('http://localhost/api/admin/login', { method: 'POST', body: 'no-json' }),
    )
    expect(res.status).toBe(400)
  })

  it('el 6.º intento fallido en la ventana → 429, incluso con la clave correcta', async () => {
    const admin = await makeAdmin()
    const ip = '203.0.113.9'
    for (let i = 0; i < 5; i++) {
      expect((await login(loginReq(admin.email, 'mala', ip))).status).toBe(401)
    }
    expect((await login(loginReq(admin.email, 'mala', ip))).status).toBe(429)
    expect((await login(loginReq(admin.email, PASSWORD, ip))).status).toBe(429)
  })
})

describe('POST /api/admin/login (límites que no dependen de la IP)', () => {
  it('variar el prefijo de X-Forwarded-For no esquiva el límite', async () => {
    const admin = await makeAdmin()
    for (let i = 0; i < 5; i++) {
      expect((await login(loginReq(admin.email, 'mala', `9.9.9.${i}, 198.51.100.7`))).status).toBe(401)
    }
    expect((await login(loginReq(admin.email, 'mala', '9.9.9.99, 198.51.100.7'))).status).toBe(429)
  })

  it('tope por email: 20 fallos por hora desde IPs distintas, y después ni la clave correcta entra', async () => {
    const admin = await makeAdmin()
    for (let i = 0; i < 20; i++) {
      expect((await login(loginReq(admin.email, 'mala', `198.51.100.${i + 1}`))).status).toBe(401)
    }
    expect((await login(loginReq(admin.email, PASSWORD, '203.0.113.200'))).status).toBe(429)
  }, 60_000)

  it('los logins correctos no consumen el tope por email', async () => {
    const admin = await makeAdmin()
    for (let i = 0; i < 6; i++) {
      expect((await login(loginReq(admin.email, PASSWORD, `198.51.101.${i + 1}`))).status).toBe(200)
    }
  }, 60_000)
})

describe('versión de sesión atada a la contraseña', () => {
  const withCookie = (v: string) => new Request('http://localhost/x', { headers: { cookie: `${SESSION_COOKIE}=${v}` } })

  it('cambiar la contraseña invalida las sesiones ya emitidas', async () => {
    const admin = await makeAdmin()
    const token = createSession(admin.id, admin.passwordHash)
    expect(await getAdminFromRequest(withCookie(token))).toMatchObject({ id: admin.id })
    await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword('otra-clave-nueva') } })
    expect(await getAdminFromRequest(withCookie(token))).toBeNull()
    const fresh = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id } })
    expect(await getAdminFromRequest(withCookie(createSession(fresh.id, fresh.passwordHash)))).toMatchObject({ id: admin.id })
  })

  it('una sesión sin versión (formato viejo) o con la versión de otra contraseña no entra', async () => {
    const admin = await makeAdmin()
    expect(await getAdminFromRequest(withCookie(createSession(admin.id, 'otra-contraseña')))).toBeNull()
    const secret = process.env.SESSION_SECRET!
    const { createHmac } = await import('node:crypto')
    const payload = Buffer.from(JSON.stringify({ uid: admin.id, exp: Date.now() + 1e6 })).toString('base64url')
    const legacy = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
    expect(await getAdminFromRequest(withCookie(legacy))).toBeNull()
  })

  it('el login emite una sesión que sirve con la contraseña actual', async () => {
    const admin = await makeAdmin()
    const res = await login(loginReq(admin.email, PASSWORD))
    const token = /sm_admin=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]
    expect(await getAdminFromRequest(withCookie(token))).toMatchObject({ id: admin.id })
  })
})

describe('POST /api/admin/logout', () => {
  it('borra la cookie', async () => {
    const res = await logout(new Request('http://localhost/api/admin/logout', { method: 'POST' }))
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${SESSION_COOKIE}=;`)
    expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=/)
  })
})

describe('getAdminFromRequest', () => {
  it('devuelve el admin con sesión válida y null sin sesión, manipulada o de usuario borrado', async () => {
    const admin = await makeAdmin()
    const withCookie = (v: string) =>
      new Request('http://localhost/x', { headers: { cookie: `a=1; ${SESSION_COOKIE}=${v}` } })
    expect(await getAdminFromRequest(withCookie(createSession(admin.id, admin.passwordHash)))).toEqual({
      id: admin.id,
      email: admin.email,
    })
    expect(await getAdminFromRequest(new Request('http://localhost/x'))).toBeNull()
    expect(await getAdminFromRequest(withCookie(createSession(admin.id, admin.passwordHash) + 'x'))).toBeNull()
    expect(await getAdminFromRequest(withCookie(createSession(admin.id + 999, admin.passwordHash)))).toBeNull()
  })
})

describe('proxy (protección de rutas)', () => {
  const req = (path: string, token?: string) =>
    new NextRequest(`http://localhost${path}`, {
      headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    })

  it('sin sesión: /admin/* redirige a /admin/login y /api/admin/* da 401', async () => {
    const page = await proxy(req('/admin/productos'))
    expect(page.status).toBe(307)
    expect(new URL(page.headers.get('location')!).pathname).toBe('/admin/login')
    const api = await proxy(req('/api/admin/products'))
    expect(api.status).toBe(401)
  })

  it('el login (página y API) queda abierto', async () => {
    for (const p of ['/admin/login', '/api/admin/login']) {
      const res = await proxy(req(p))
      expect(res.headers.get('x-middleware-next')).toBe('1')
    }
  })

  it('token manipulado se rechaza; token válido pasa', async () => {
    const token = createSession(1, 'hash-a')
    const bad = await proxy(req('/admin', token.slice(0, -2) + 'AA'))
    expect(bad.status).toBe(307)
    const ok = await proxy(req('/admin/pedidos', token))
    expect(ok.headers.get('x-middleware-next')).toBe('1')
    const okApi = await proxy(req('/api/admin/products', token))
    expect(okApi.headers.get('x-middleware-next')).toBe('1')
  })
})
