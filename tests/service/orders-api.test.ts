import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { seed } from '../../prisma/seed'
import { POST } from '@/app/api/orders/route'
import { verifyOrderAccess } from '@/lib/orderAccess'
import { resetRateLimitsForTests } from '@/lib/rateLimit'
import { resetDb } from './helpers'

let ids: { product: number; wholesale: number; outOfStock: number; inactive: number; payment: number; pickup: number; zone: number }

function req(body: unknown, raw = false, ip?: string) {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

function valid(over: Record<string, unknown> = {}) {
  return {
    items: [{ productId: ids.product, quantity: 2 }],
    customerName: 'Ana Pérez',
    phone: '381 611-6380',
    deliveryType: 'PICKUP',
    pickupPointId: ids.pickup,
    paymentMethodId: ids.payment,
    ...over,
  }
}

beforeEach(async () => {
  resetRateLimitsForTests()
  await resetDb()
  await seed(db)
  const cat = await db.category.findFirstOrThrow()
  const mk = (name: string, extra: object = {}) =>
    db.product.create({
      data: { name, slug: name.toLowerCase().replace(/\s+/g, '-'), categoryId: cat.id, retailPrice: 10000, stock: 10, ...extra },
    })
  const product = await mk('Test Retail')
  const wholesale = await mk('Test Mayorista', { wholesalePrice: 5000, wholesaleMinQty: 2 })
  const outOfStock = await mk('Test Agotado', { stock: 0 })
  const inactive = await mk('Test Inactivo', { active: false })
  ids = {
    product: product.id,
    wholesale: wholesale.id,
    outOfStock: outOfStock.id,
    inactive: inactive.id,
    payment: (await db.paymentMethod.findFirstOrThrow({ where: { name: 'Transferencia' } })).id,
    pickup: (await db.pickupPoint.findFirstOrThrow()).id,
    zone: (await db.shippingZone.findFirstOrThrow()).id,
  }
})

describe('POST /api/orders', () => {
  it('201: devuelve código, total del servidor, enlace wa.me y cookie lastOrderCode', async () => {
    const res = await POST(req(valid()))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.code).toMatch(/^SM-[2-9A-HJKMNP-Z]{6}$/)
    expect(body.total).toBe(20000)
    expect(body.whatsappUrl).toContain('https://wa.me/543816116380?text=')
    expect(decodeURIComponent(body.whatsappUrl)).toContain(body.code)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`lastOrderCode=${body.code}`)
    // La cookie va firmada: el código a secas no habilita /pedido/[code].
    const value = /lastOrderCode=([^;]+)/.exec(cookie)![1]
    expect(value).not.toBe(body.code)
    expect(verifyOrderAccess(value, body.code)).toBe(true)
    expect(verifyOrderAccess(body.code, body.code)).toBe(false)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(cookie).toContain('Max-Age=7200')
    expect(cookie).toContain('Path=/')
  })

  it('payload manipulado: precios, total, envío y wholesaleUnlocked del cliente se ignoran', async () => {
    await db.storeSettings.update({ where: { id: 1 }, data: { wholesaleMode: 'CODE' } })
    const res = await POST(
      req(
        valid({
          items: [{ productId: ids.wholesale, quantity: 2, unitPrice: 1, price: 1, subtotal: 1 }],
          deliveryType: 'SHIPPING',
          shippingZoneId: ids.zone,
          shippingAddress: 'Calle Falsa 123',
          pickupPointId: undefined,
          total: 1,
          subtotal: 1,
          shippingCost: 0,
          unitPrice: 1,
          wholesaleUnlocked: true,
        }),
      ),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    const zone = await db.shippingZone.findUniqueOrThrow({ where: { id: ids.zone } })
    // 2 x 10000 (minorista: el mayorista no se desbloquea desde el cliente hasta la Task 12) + envío del servidor
    expect(body.total).toBe(20000 + zone.cost)
    const order = await db.order.findUniqueOrThrow({ where: { code: body.code }, include: { items: true } })
    expect(order.shippingCost).toBe(zone.cost)
    expect(order.items[0].unitPrice).toBe(10000)
    expect(order.items[0].wholesale).toBe(false)
  })

  it.each([0, -1, 1.5])('400 con cantidad %s', async (quantity) => {
    const res = await POST(req(valid({ items: [{ productId: ids.product, quantity }] })))
    expect(res.status).toBe(400)
  })

  it('400 con producto inexistente, inactivo, JSON roto o body vacío', async () => {
    expect((await POST(req(valid({ items: [{ productId: 999999, quantity: 1 }] })))).status).toBe(400)
    expect((await POST(req(valid({ items: [{ productId: ids.inactive, quantity: 1 }] })))).status).toBe(400)
    expect((await POST(req('{no es json', true))).status).toBe(400)
    expect((await POST(req({}))).status).toBe(400)
  })

  it('409 out_of_stock con productId, sin cookie y sin descontar stock', async () => {
    const res = await POST(req(valid({ items: [{ productId: ids.outOfStock, quantity: 1 }] })))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'out_of_stock', productId: ids.outOfStock })
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await db.order.count()).toBe(0)
  })

  it('400 con ids fuera del rango de la base (no 500) y con demasiados renglones o cantidad absurda', async () => {
    expect((await POST(req(valid({ items: [{ productId: 3_000_000_000, quantity: 1 }] })))).status).toBe(400)
    expect((await POST(req(valid({ paymentMethodId: 3_000_000_000 })))).status).toBe(400)
    expect((await POST(req(valid({ pickupPointId: 3_000_000_000 })))).status).toBe(400)
    expect((await POST(req(valid({ items: [{ productId: ids.product, quantity: 1000 }] })))).status).toBe(400)
    const many = Array.from({ length: 31 }, (_, i) => ({ productId: ids.product + i, quantity: 1 }))
    expect((await POST(req(valid({ items: many })))).status).toBe(400)
    expect(await db.order.count()).toBe(0)
  })

  it('rechaza cuerpos enormes sin procesarlos', async () => {
    const res = await POST(req(valid({ customerName: 'a'.repeat(200_000) })))
    expect(res.status).toBe(413)
    expect(await db.order.count()).toBe(0)
  })
})

describe('POST /api/orders: límite de pedidos', () => {
  const phoneN = (i: number) => `381 611-${String(1000 + i)}`

  it('por teléfono normalizado: 5 por hora aunque cambie la IP y el formato; el 6.º da 429 sin reservar stock', async () => {
    const formats = ['381 611-6380', '3816116380', '+54 9 381 611 6380', '0381 611-6380', '(381) 6116380']
    for (let i = 0; i < 5; i++) {
      expect((await POST(req(valid({ phone: formats[i], items: [{ productId: ids.product, quantity: 1 }] }), false, `198.51.100.${i + 1}`))).status).toBe(201)
    }
    const stockBefore = (await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock
    const res = await POST(req(valid({ phone: '381-611-6380' }), false, '203.0.113.77'))
    expect(res.status).toBe(429)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await db.order.count()).toBe(5)
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(stockBefore)
  })

  it('por IP: el 11.º intento desde la misma IP da 429 aunque cambie el teléfono; otra IP no se ve afectada', async () => {
    await db.product.update({ where: { id: ids.product }, data: { stock: 100 } })
    for (let i = 0; i < 10; i++) {
      expect((await POST(req(valid({ phone: phoneN(i), items: [{ productId: ids.product, quantity: 1 }] }), false, '203.0.113.5'))).status).toBe(201)
    }
    expect((await POST(req(valid({ phone: phoneN(50) }), false, '203.0.113.5'))).status).toBe(429)
    expect((await POST(req(valid({ phone: phoneN(51) }), false, '203.0.113.6'))).status).toBe(201)
  })

  it('variar el prefijo de X-Forwarded-For no esquiva el límite por IP', async () => {
    await db.product.update({ where: { id: ids.product }, data: { stock: 100 } })
    for (let i = 0; i < 10; i++) {
      const r = await POST(req(valid({ phone: phoneN(i), items: [{ productId: ids.product, quantity: 1 }] }), false, `1.2.3.${i}, 198.51.100.9`))
      expect(r.status).toBe(201)
    }
    expect((await POST(req(valid({ phone: phoneN(60) }), false, '1.2.3.99, 198.51.100.9'))).status).toBe(429)
  })

  it('una ráfaga en paralelo del mismo teléfono no pasa de 5 pedidos', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        POST(req(valid({ items: [{ productId: ids.product, quantity: 1 }] }), false, `198.51.102.${i + 1}`)),
      ),
    )
    expect(results.filter((r) => r.status === 201)).toHaveLength(5)
    expect(results.filter((r) => r.status === 429)).toHaveLength(15)
    expect(await db.order.count()).toBe(5)
  })
})
