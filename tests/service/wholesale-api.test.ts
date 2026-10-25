import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { seed } from '../../prisma/seed'
import { unitPriceFor } from '@/lib/pricing'
import { WHOLESALE_COOKIE, isWholesaleUnlocked, signWholesaleToken } from '@/lib/wholesale'
import { POST as unlock } from '@/app/api/wholesale/unlock/route'
import { POST as createOrder } from '@/app/api/orders/route'
import { GET as cartData } from '@/app/api/cart/route'
import { resetRateLimitsForTests } from '@/lib/rateLimit'
import { resetDb } from './helpers'

const CODE = 'Salon-2026'
let n = 0
let ids: { wholesale: number; retail: number; payment: number; pickup: number }

// El límite de intentos es en memoria y sobrevive entre tests: cada llamada usa una IP distinta salvo que se pida otra.
function unlockReq(body: unknown, ip = `10.1.0.${++n}`) {
  return new Request('http://localhost/api/wholesale/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

const cookieHeader = (code: string) => `${WHOLESALE_COOKIE}=${signWholesaleToken(code)}`

function orderReq(quantity: number, cookie?: string) {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
      items: [{ productId: ids.wholesale, quantity }],
      customerName: 'Ana Pérez',
      phone: '381 611-6380',
      deliveryType: 'PICKUP',
      pickupPointId: ids.pickup,
      paymentMethodId: ids.payment,
    }),
  })
}

function cartReq(cookie?: string) {
  return new NextRequest(`http://localhost/api/cart?ids=${ids.wholesale},${ids.retail}`, {
    headers: cookie ? { cookie } : {},
  })
}

async function setMode(wholesaleMode: 'PUBLIC' | 'CODE', wholesaleCode: string | null = CODE) {
  await db.storeSettings.update({ where: { id: 1 }, data: { wholesaleMode, wholesaleCode } })
}

beforeEach(async () => {
  resetRateLimitsForTests()
  await resetDb()
  await seed(db)
  const cat = await db.category.findFirstOrThrow()
  const mk = (name: string, extra: object = {}) =>
    db.product.create({
      data: { name, slug: name.toLowerCase().replace(/\s+/g, '-'), categoryId: cat.id, retailPrice: 10000, stock: 50, ...extra },
    })
  const wholesale = await mk('Test Mayorista', { wholesalePrice: 6000, wholesaleMinQty: 3 })
  const retail = await mk('Test Minorista')
  ids = {
    wholesale: wholesale.id,
    retail: retail.id,
    payment: (await db.paymentMethod.findFirstOrThrow({ where: { name: 'Transferencia' } })).id,
    pickup: (await db.pickupPoint.findFirstOrThrow()).id,
  }
  await setMode('CODE')
})

describe('POST /api/wholesale/unlock', () => {
  it('200 con el código correcto: cookie httpOnly firmada con el código actual', async () => {
    const res = await unlock(unlockReq({ code: CODE }))
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`${WHOLESALE_COOKIE}=`)
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
    expect(setCookie).toContain('Path=/')
    const value = /sm_wholesale=([^;]+)/.exec(setCookie)![1]
    expect(isWholesaleUnlocked(value, CODE)).toBe(true)
  })

  it('acepta espacios alrededor y no distingue mayúsculas', async () => {
    expect((await unlock(unlockReq({ code: `  ${CODE.toLowerCase()} ` }))).status).toBe(200)
  })

  it('401 sin cookie con un código incorrecto, vacío o de otro tipo', async () => {
    for (const body of [{ code: 'nope' }, { code: '' }, { code: 123 }, {}]) {
      const res = await unlock(unlockReq(body))
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })

  it('401 si el local no tiene código configurado, aunque se mande vacío o "null"', async () => {
    await setMode('CODE', null)
    for (const code of ['', 'null', CODE]) {
      const res = await unlock(unlockReq({ code }))
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })

  it('401 en modo PUBLIC: no hay nada que desbloquear', async () => {
    await setMode('PUBLIC')
    const res = await unlock(unlockReq({ code: CODE }))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('400 con JSON roto', async () => {
    const res = await unlock(
      new Request('http://localhost/api/wholesale/unlock', { method: 'POST', body: '{no es json', headers: { 'x-forwarded-for': `10.1.1.${++n}` } }),
    )
    expect(res.status).toBe(400)
  })

  it('429 al pasar el límite de intentos, incluso con el código correcto; otra IP no se ve afectada', async () => {
    const ip = '10.9.9.9'
    for (let i = 0; i < 10; i++) expect((await unlock(unlockReq({ code: 'mal' }, ip))).status).toBe(401)
    const blocked = await unlock(unlockReq({ code: CODE }, ip))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('set-cookie')).toBeNull()
    expect((await unlock(unlockReq({ code: CODE }, '10.9.9.10'))).status).toBe(200)
  })
})

describe('POST /api/wholesale/unlock (límites que no dependen de la IP)', () => {
  it('variar el prefijo de X-Forwarded-For no esquiva el límite', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await unlock(unlockReq({ code: 'mal' }, `1.2.3.${i}, 198.51.100.7`))).status).toBe(401)
    }
    expect((await unlock(unlockReq({ code: 'mal' }, '1.2.3.99, 198.51.100.7'))).status).toBe(429)
  })

  it('tope global: 30 códigos incorrectos por hora desde IPs distintas y después ni el correcto entra', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await unlock(unlockReq({ code: `mal${i}` }, `198.51.100.${i + 1}`))).status).toBe(401)
    }
    const blocked = await unlock(unlockReq({ code: CODE }, '203.0.113.250'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('set-cookie')).toBeNull()
  })

  it('los desbloqueos correctos no consumen el tope global', async () => {
    for (let i = 0; i < 10; i++) expect((await unlock(unlockReq({ code: CODE }, `198.51.101.${i + 1}`))).status).toBe(200)
  })
})

describe('GET /api/cart: los precios mayoristas solo salen si corresponde', () => {
  it('modo CODE sin cookie: no se filtra ningún dato mayorista', async () => {
    const body = await (await cartData(cartReq())).json()
    expect(body).toHaveLength(2)
    for (const p of body) {
      expect(p.wholesalePrice ?? null).toBeNull()
      expect(p.wholesaleMinQty ?? null).toBeNull()
    }
    expect(JSON.stringify(body)).not.toContain('6000')
  })

  it('modo CODE con cookie válida: precio y mínimo mayorista', async () => {
    const body = await (await cartData(cartReq(cookieHeader(CODE)))).json()
    const w = body.find((p: { id: number }) => p.id === ids.wholesale)
    expect(w).toMatchObject({ retailPrice: 10000, wholesalePrice: 6000, wholesaleMinQty: 3 })
    const r = body.find((p: { id: number }) => p.id === ids.retail)
    expect(r.wholesalePrice ?? null).toBeNull()
  })

  it('cookie vieja (el código cambió): vuelve a ocultarse', async () => {
    const old = cookieHeader(CODE)
    await setMode('CODE', 'Codigo-Nuevo')
    const body = await (await cartData(cartReq(old))).json()
    expect(JSON.stringify(body)).not.toContain('6000')
  })

  it('modo PUBLIC: se ve sin cookie', async () => {
    await setMode('PUBLIC', null)
    const body = await (await cartData(cartReq())).json()
    expect(body.find((p: { id: number }) => p.id === ids.wholesale)).toMatchObject({ wholesalePrice: 6000, wholesaleMinQty: 3 })
  })
})

describe('POST /api/orders con la cookie mayorista', () => {
  it('modo CODE + cookie válida: precio mayorista al llegar al mínimo, minorista por debajo', async () => {
    const ok = await (await createOrder(orderReq(3, cookieHeader(CODE)))).json()
    expect(ok.total).toBe(3 * 6000)
    const below = await (await createOrder(orderReq(2, cookieHeader(CODE)))).json()
    expect(below.total).toBe(2 * 10000)
  })

  it('modo CODE sin cookie, con cookie vieja o con basura: minorista', async () => {
    const old = cookieHeader(CODE)
    await setMode('CODE', 'Codigo-Nuevo')
    for (const cookie of [undefined, old, `${WHOLESALE_COOKIE}=basura`]) {
      const body = await (await createOrder(orderReq(5, cookie))).json()
      expect(body.total).toBe(5 * 10000)
    }
  })

  it('modo PUBLIC: mayorista al llegar al mínimo sin cookie', async () => {
    await setMode('PUBLIC', null)
    expect((await (await createOrder(orderReq(3))).json()).total).toBe(3 * 6000)
  })

  it('el total que calcula el carrito con los datos de /api/cart coincide con el del pedido', async () => {
    for (const [mode, cookie] of [['CODE', cookieHeader(CODE)], ['CODE', undefined], ['PUBLIC', undefined]] as const) {
      await setMode(mode, mode === 'PUBLIC' ? null : CODE)
      const p = (await (await cartData(cartReq(cookie))).json()).find((x: { id: number }) => x.id === ids.wholesale)
      for (const qty of [1, 2, 3, 7]) {
        const shown = qty * unitPriceFor(p, qty, true, 'PUBLIC').unitPrice
        const placed = await (await createOrder(orderReq(qty, cookie))).json()
        expect(placed.total).toBe(shown)
      }
    }
  })
})
