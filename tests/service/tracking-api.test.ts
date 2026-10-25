import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { seed } from '../../prisma/seed'
import { placeOrder, resetExpiryThrottleForTests } from '@/lib/orders'
import { POST } from '@/app/api/tracking/route'
import { resetRateLimitsForTests } from '@/lib/rateLimit'
import { resetDb } from './helpers'

let code: string
let n = 0

// Cada llamada usa una IP distinta salvo que el test pida lo contrario: el límite es en memoria y sobrevive entre tests.
function req(body: unknown, ip = `10.0.0.${++n}`, raw = false) {
  return new Request('http://localhost/api/tracking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

beforeEach(async () => {
  resetRateLimitsForTests()
  resetExpiryThrottleForTests()
  await resetDb()
  await seed(db)
  const cat = await db.category.findFirstOrThrow()
  const product = await db.product.create({
    data: { name: 'Test Tracking', slug: 'test-tracking', categoryId: cat.id, retailPrice: 10000, stock: 10 },
  })
  const placed = await placeOrder({
    items: [{ productId: product.id, quantity: 2 }],
    customerName: 'Ana Pérez',
    phone: '381 611-6380',
    deliveryType: 'PICKUP',
    pickupPointId: (await db.pickupPoint.findFirstOrThrow()).id,
    paymentMethodId: (await db.paymentMethod.findFirstOrThrow({ where: { name: 'Transferencia' } })).id,
    wholesaleUnlocked: false,
  })
  code = placed.code
})

describe('POST /api/tracking', () => {
  it.each(['381 611-6380', '3816116380', '+54 9 381 611 6380', '0381 611-6380'])('200 con el teléfono %s', async (phone) => {
    const res = await POST(req({ code, phone }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe(code)
    expect(body.status).toBe('RECEIVED')
    expect(body.paymentStatus).toBe('PENDING')
    expect(body.total).toBe(20000)
    expect(body.items).toEqual([{ productName: 'Test Tracking', quantity: 2, unitPrice: 10000 }])
  })

  it('no expone el teléfono ni el nombre', async () => {
    const text = await (await POST(req({ code, phone: '3816116380' }))).text()
    expect(text).not.toContain('3816116380')
    expect(text).not.toContain('Ana')
  })

  it('acepta el código en minúsculas y con espacios', async () => {
    const res = await POST(req({ code: `  ${code.toLowerCase()} `, phone: '3816116380' }))
    expect(res.status).toBe(200)
  })

  it('404 idéntico (status y cuerpo) para teléfono incorrecto y código inexistente', async () => {
    const wrongPhone = await POST(req({ code, phone: '381 555-0000' }))
    const wrongCode = await POST(req({ code: 'SM-ZZZZZZ', phone: '381 611-6380' }))
    const garbage = await POST(req({ code, phone: 'abc' }))
    expect(wrongPhone.status).toBe(404)
    expect(wrongCode.status).toBe(404)
    expect(garbage.status).toBe(404)
    const a = await wrongPhone.text()
    expect(a).toBe(await wrongCode.text())
    expect(a).toBe(await garbage.text())
    expect(JSON.parse(a)).toEqual({ error: 'not_found' })
  })

  it('400 si el cuerpo no es JSON o faltan campos', async () => {
    expect((await POST(req('no json', undefined, true))).status).toBe(400)
    expect((await POST(req({ code }))).status).toBe(400)
    expect((await POST(req({ code: 1, phone: 2 }))).status).toBe(400)
  })

  it('429 en el 6.º intento con la misma IP y código', async () => {
    const ip = '10.9.9.9'
    for (let i = 0; i < 5; i++) {
      expect((await POST(req({ code, phone: '381 555-0000' }, ip))).status).toBe(404)
    }
    expect((await POST(req({ code, phone: '381 555-0000' }, ip))).status).toBe(429)
    // Aun con el teléfono correcto: el límite corta antes de consultar.
    expect((await POST(req({ code, phone: '3816116380' }, ip))).status).toBe(429)
    // Otra IP tampoco entra: 5 teléfonos incorrectos agotan el tope por código (ver el test del tope por código).
    expect((await POST(req({ code, phone: '3816116380' }, '10.9.9.10'))).status).toBe(429)
    // El límite por IP+código es de esa IP: un código distinto sí responde.
    expect((await POST(req({ code: 'SM-ZZZZZZ', phone: '381 555-0000' }, '10.9.9.10'))).status).toBe(404)
  })

  it('variar el prefijo de X-Forwarded-For ya no esquiva el límite (cuenta la entrada del proxy)', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await POST(req({ code, phone: '381 555-0000' }, `1.2.3.${i}, 198.51.100.7`))).status).toBe(404)
    }
    expect((await POST(req({ code, phone: '381 555-0000' }, '1.2.3.99, 198.51.100.7'))).status).toBe(429)
  })

  it('tope por código independiente de la IP: 5 teléfonos incorrectos por hora', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await POST(req({ code, phone: '381 555-0000' }, `203.0.113.${i + 1}`))).status).toBe(404)
    }
    // IP nueva, teléfono correcto: igual bloqueado, si no se podría seguir adivinando.
    expect((await POST(req({ code, phone: '3816116380' }, '203.0.113.99'))).status).toBe(429)
    // Otro código no se ve afectado.
    expect((await POST(req({ code: 'SM-ZZZZZZ', phone: '381 555-0000' }, '203.0.113.99'))).status).toBe(404)
  })

  it('los intentos correctos no consumen el tope por código', async () => {
    for (let i = 0; i < 8; i++) {
      expect((await POST(req({ code, phone: '3816116380' }, `203.0.114.${i + 1}`))).status).toBe(200)
    }
  })

  it('código o teléfono absurdamente largos dan el mismo 404 sin crecer el límite', async () => {
    const res = await POST(req({ code: 'x'.repeat(5000), phone: '1'.repeat(5000) }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('la expiración perezosa se limita a una vez por minuto', async () => {
    const { expireStaleOrdersThrottled } = await import('@/lib/orders')
    resetExpiryThrottleForTests()
    await db.order.updateMany({ where: { code }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await expireStaleOrdersThrottled(new Date())).toBe(1)
    await db.order.updateMany({ where: { code }, data: { status: 'RECEIVED', expiresAt: new Date(Date.now() - 1000) } })
    expect(await expireStaleOrdersThrottled(new Date())).toBe(0) // dentro del minuto: no corre
    expect(await expireStaleOrdersThrottled(new Date(Date.now() + 61_000))).toBe(1)
  })

  it('expiración perezosa: un pedido pendiente vencido se muestra CANCELLED y repone stock', async () => {
    await db.order.updateMany({ where: { code }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await POST(req({ code, phone: '3816116380' }))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('CANCELLED')
    expect((await db.product.findFirstOrThrow({ where: { slug: 'test-tracking' } })).stock).toBe(10)
  })
})
