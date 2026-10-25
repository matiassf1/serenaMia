import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { createSession, SESSION_COOKIE } from '@/lib/auth'
import { seed } from '../../prisma/seed'
import { placeOrder } from '@/lib/orders'
import { customerWhatsAppUrl, listAdminOrders } from '@/lib/adminOrders'
import { POST } from '@/app/api/admin/orders/[id]/route'
import { resetDb } from './helpers'

let productId: number
let adminId: number

async function newOrder(over: { phone?: string; quantity?: number } = {}) {
  const res = await placeOrder({
    items: [{ productId, quantity: over.quantity ?? 2 }],
    customerName: 'Ana Pérez',
    phone: over.phone ?? '381 611-6380',
    deliveryType: 'PICKUP',
    pickupPointId: (await db.pickupPoint.findFirstOrThrow()).id,
    paymentMethodId: (await db.paymentMethod.findFirstOrThrow()).id,
    wholesaleUnlocked: false,
  })
  return res
}

async function act(id: number, body: unknown, withSession = true) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (withSession) headers.cookie = `${SESSION_COOKIE}=${createSession(adminId)}`
  const req = new Request(`http://localhost/api/admin/orders/${id}`, { method: 'POST', headers, body: JSON.stringify(body) })
  return POST(req, { params: Promise.resolve({ id: String(id) }) })
}

const stock = async () => (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock

beforeEach(async () => {
  process.env.SESSION_SECRET ??= 'test-secret-orders-admin'
  await resetDb()
  await seed(db)
  const cat = await db.category.findFirstOrThrow()
  productId = (await db.product.create({ data: { name: 'Esmalte', slug: 'esmalte', categoryId: cat.id, retailPrice: 10000, stock: 10 } })).id
  adminId = (await db.adminUser.create({ data: { email: 'elias@serenamia.test', passwordHash: 'x' } })).id
})

afterAll(async () => {
  await db.$disconnect()
})

describe('POST /api/admin/orders/[id]', () => {
  it('sin sesión responde 401 y no cambia nada', async () => {
    const { id } = await newOrder()
    const res = await act(id, { action: 'paid' }, false)
    expect(res.status).toBe(401)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).paymentStatus).toBe('PENDING')
  })

  it('"seen" limpia isNew (abrir el detalle)', async () => {
    const { id } = await newOrder()
    expect((await db.order.findUniqueOrThrow({ where: { id } })).isNew).toBe(true)
    expect((await act(id, { action: 'seen' })).status).toBe(200)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).isNew).toBe(false)
  })

  it('"paid" marca el pago como pagado', async () => {
    const { id } = await newOrder()
    expect((await act(id, { action: 'paid' })).status).toBe(200)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).paymentStatus).toBe('PAID')
  })

  it('"status" avanza el estado y rechaza valores inválidos', async () => {
    const { id } = await newOrder()
    expect((await act(id, { action: 'status', status: 'PREPARING' })).status).toBe(200)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe('PREPARING')
    expect((await act(id, { action: 'status', status: 'BANANA' })).status).toBe(400)
  })

  it('"cancel" repone el stock una sola vez', async () => {
    const { id } = await newOrder({ quantity: 3 })
    expect(await stock()).toBe(7)
    expect((await act(id, { action: 'cancel' })).status).toBe(200)
    expect(await stock()).toBe(10)
    expect((await act(id, { action: 'cancel' })).status).toBe(200)
    expect(await stock()).toBe(10)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED')
  })

  it('un pedido cancelado no se reactiva (409)', async () => {
    const { id } = await newOrder()
    await act(id, { action: 'cancel' })
    expect((await act(id, { action: 'status', status: 'READY' })).status).toBe(409)
  })

  it('pedido inexistente responde 404', async () => {
    expect((await act(99999, { action: 'paid' })).status).toBe(404)
  })

  it('"extend" mueve expiresAt y evita la expiración', async () => {
    const { id } = await newOrder()
    await db.order.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await act(id, { action: 'extend', hours: 24 })).status).toBe(200)
    const o = await db.order.findUniqueOrThrow({ where: { id } })
    expect(o.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000)
    await listAdminOrders('ALL')
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe('RECEIVED')
  })

  it('"extend" suma las horas al plazo vigente (nunca lo acorta)', async () => {
    const { id } = await newOrder() // vence en 48 h
    await act(id, { action: 'extend', hours: 24 })
    const o = await db.order.findUniqueOrThrow({ where: { id } })
    expect(o.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 71 * 3600_000)
  })

  it.each([0, -5, 1.5, 100000, 'x'])('"extend" rechaza horas inválidas (%s)', async (hours) => {
    const { id } = await newOrder()
    expect((await act(id, { action: 'extend', hours })).status).toBe(400)
  })
})

describe('listAdminOrders', () => {
  it('expira perezosamente los pedidos vencidos y repone stock', async () => {
    const { id } = await newOrder({ quantity: 4 })
    await db.order.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await stock()).toBe(6)
    const { orders } = await listAdminOrders('ALL')
    expect(orders.find((o) => o.id === id)!.status).toBe('CANCELLED')
    expect(await stock()).toBe(10)
  })

  it('cuenta los pedidos nuevos y filtra por estado', async () => {
    const a = await newOrder()
    const b = await newOrder()
    await newOrder()
    await db.order.update({ where: { id: a.id }, data: { isNew: false, status: 'READY' } })
    await db.order.update({ where: { id: b.id }, data: { status: 'PREPARING' } })
    const all = await listAdminOrders('ALL')
    expect(all.orders).toHaveLength(3)
    expect(all.newCount).toBe(2)
    const ready = await listAdminOrders('READY')
    expect(ready.orders.map((o) => o.id)).toEqual([a.id])
    expect(ready.newCount).toBe(2) // el contador no depende del filtro
    expect(ready.counts.PREPARING).toBe(1)
  })

  it('ordena del más reciente al más viejo', async () => {
    const a = await newOrder()
    const b = await newOrder()
    const { orders } = await listAdminOrders('ALL')
    expect(orders.map((o) => o.id)).toEqual([b.id, a.id])
  })
})

describe('customerWhatsAppUrl', () => {
  const order = { code: 'SM-7K2Q9', customerName: 'Ana Pérez', phone: '3816116380' }

  it('apunta a 54 + teléfono de la clienta', () => {
    expect(customerWhatsAppUrl({ ...order, status: 'READY', paymentStatus: 'PENDING' })).toMatch(/^https:\/\/wa\.me\/543816116380\?text=/)
  })

  it.each([
    ['RECEIVED', 'recibimos'],
    ['PREPARING', 'preparando'],
    ['READY', 'listo'],
    ['DELIVERED', 'entregado'],
    ['CANCELLED', 'cancel'],
  ] as const)('el mensaje de %s menciona el estado y el número de pedido', (status, word) => {
    const url = customerWhatsAppUrl({ ...order, status, paymentStatus: 'PENDING' })
    const text = decodeURIComponent(url.split('?text=')[1])
    expect(text).toContain('SM-7K2Q9')
    expect(text).toContain('Ana')
    expect(text.toLowerCase()).toContain(word)
  })

  it('avisa si falta el pago', () => {
    const pending = decodeURIComponent(customerWhatsAppUrl({ ...order, status: 'RECEIVED', paymentStatus: 'PENDING' }).split('?text=')[1])
    const paid = decodeURIComponent(customerWhatsAppUrl({ ...order, status: 'RECEIVED', paymentStatus: 'PAID' }).split('?text=')[1])
    expect(pending.toLowerCase()).toContain('pago')
    expect(paid.toLowerCase()).toContain('pago recibido')
  })
})
