import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { seed } from '../../prisma/seed'
import { placeOrder } from '@/lib/orders'
import { POST } from '@/app/api/cron/expire/route'
import { resetDb } from './helpers'

const SECRET = 'test-cron-secret'
let productId: number
let previousSecret: string | undefined

function req(authorization?: string) {
  return new Request('http://localhost/api/cron/expire', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

beforeAll(() => {
  previousSecret = process.env.CRON_SECRET
  process.env.CRON_SECRET = SECRET
})

afterAll(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previousSecret
})

beforeEach(async () => {
  await resetDb()
  await seed(db)
  const cat = await db.category.findFirstOrThrow()
  const product = await db.product.create({
    data: { name: 'Test Cron', slug: 'test-cron', categoryId: cat.id, retailPrice: 10000, stock: 10 },
  })
  productId = product.id
  const placed = await placeOrder({
    items: [{ productId, quantity: 3 }],
    customerName: 'Ana Pérez',
    phone: '381 611-6380',
    deliveryType: 'PICKUP',
    pickupPointId: (await db.pickupPoint.findFirstOrThrow()).id,
    paymentMethodId: (await db.paymentMethod.findFirstOrThrow({ where: { name: 'Transferencia' } })).id,
    wholesaleUnlocked: false,
  })
  // Lo dejamos vencido sin esperar 48 h.
  await db.order.update({ where: { code: placed.code }, data: { expiresAt: new Date(Date.now() - 1000) } })
})

describe('POST /api/cron/expire', () => {
  it('401 sin header', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect((await db.order.findFirstOrThrow()).status).toBe('RECEIVED')
  })

  it.each(['Bearer wrong', 'Bearer test-cron-secret-x', 'Bearer ', SECRET, 'Basic test-cron-secret'])(
    '401 con header incorrecto %j',
    async (header) => {
      expect((await POST(req(header))).status).toBe(401)
    },
  )

  it('401 si CRON_SECRET no está configurado, aunque el header venga vacío', async () => {
    delete process.env.CRON_SECRET
    try {
      expect((await POST(req('Bearer '))).status).toBe(401)
      expect((await POST(req('Bearer undefined'))).status).toBe(401)
    } finally {
      process.env.CRON_SECRET = SECRET
    }
  })

  it('cancela el pedido vencido y es idempotente en la segunda llamada', async () => {
    const first = await POST(req(`Bearer ${SECRET}`))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ expired: 1 })
    expect((await db.order.findFirstOrThrow()).status).toBe('CANCELLED')
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(10)

    const second = await POST(req(`Bearer ${SECRET}`))
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ expired: 0 })
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(10)
  })
})

describe('POST /api/cron/expire con un secreto débil en producción', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('no autoriza ni con el secreto correcto si es débil o el placeholder (401, no expira nada)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const weak of ['corta', 'change-me-to-another-random-string']) {
      vi.stubEnv('CRON_SECRET', weak)
      expect((await POST(req(`Bearer ${weak}`))).status).toBe(401)
    }
    expect(await db.order.count({ where: { status: 'CANCELLED' } })).toBe(0)
  })

  it('con un secreto fuerte en producción sí autoriza', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const strong = 'z'.repeat(40)
    vi.stubEnv('CRON_SECRET', strong)
    expect((await POST(req(`Bearer ${strong}`))).status).toBe(200)
  })
})
