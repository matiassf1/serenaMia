import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { SESSION_COOKIE, createSession } from '@/lib/auth'
import { parseARSToCentavos } from '@/lib/money'
import { POST as saveProductRoute, PATCH as patchProduct } from '@/app/api/admin/products/route'
import { POST as bulkPrice } from '@/app/api/admin/products/bulk-price/route'
import { POST as orderAction } from '@/app/api/admin/orders/[id]/route'
import { POST as zoneRoute, PATCH as zonePatch } from '@/app/api/admin/shipping-zones/route'
import { resetDb } from './helpers'

// Fuera de rango = 400 (o 404 si el id no puede existir), nunca 500 por desborde de entero en Postgres.
let cookie: string
let categoryId: number
let productId: number

beforeEach(async () => {
  await resetDb()
  const admin = await db.adminUser.create({ data: { email: 'elias@serenamia.test', passwordHash: 'x' } })
  cookie = `${SESSION_COOKIE}=${createSession(admin.id, admin.passwordHash)}`
  categoryId = (await db.category.create({ data: { name: 'Insumos', slug: 'insumos' } })).id
  productId = (await db.product.create({ data: { name: 'Base', slug: 'base', categoryId, retailPrice: 150000, stock: 5 } })).id
})

function productForm(over: Record<string, string> = {}) {
  const f = new FormData()
  const fields: Record<string, string> = {
    name: 'Producto',
    categoryId: String(categoryId),
    retailPrice: '1.500,00',
    stock: '5',
    lowStockThreshold: '3',
    active: 'on',
    ...over,
  }
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const postForm = (f: FormData) =>
  saveProductRoute(new Request('http://localhost/api/admin/products', { method: 'POST', headers: { cookie }, body: f }))
const json = (url: string, body: unknown, method = 'POST') =>
  new Request(`http://localhost${url}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/admin/products con valores fuera de rango', () => {
  it.each([
    ['id no numérico', { id: 'abc' }],
    ['id gigante', { id: '99999999999999999999' }],
    ['id negativo', { id: '-3' }],
    ['stock mayor a 2^31', { stock: '3000000000' }],
    ['stock mayor al tope', { stock: '1000001' }],
    ['aviso de stock bajo gigante', { lowStockThreshold: '3000000000' }],
    ['precio gigante', { retailPrice: '99999999999' }],
    ['precio apenas sobre el tope', { retailPrice: '10.000.000,01' }],
    ['categoría fuera del rango', { categoryId: '3000000000' }],
    ['mínimo mayorista gigante', { wholesalePrice: '10,00', wholesaleMinQty: '3000000000' }],
  ])('%s → 400', async (_n, over) => {
    const res = await postForm(productForm(over))
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
  })

  it('los topes exactos sí se aceptan', async () => {
    const res = await postForm(productForm({ stock: '1000000', retailPrice: '10.000.000,00' }))
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/admin/products (ajustes rápidos)', () => {
  it.each([
    ['delta gigante', { id: 0, delta: 3_000_000_000 }],
    ['delta sobre el tope', { id: 0, delta: 1_000_001 }],
    ['delta negativo sobre el tope', { id: 0, delta: -1_000_001 }],
    ['id gigante', { id: 3_000_000_000, delta: 1 }],
    ['id cero', { id: 0, delta: 1 }],
  ])('%s → 400', async (_n, body) => {
    const id = body.id === 0 && _n !== 'id cero' ? productId : body.id
    const res = await patchProduct(json('/api/admin/products', { ...body, id }, 'PATCH'))
    expect(res.status).toBe(400)
  })

  it('un delta dentro del tope funciona', async () => {
    const res = await patchProduct(json('/api/admin/products', { id: productId, delta: 1 }, 'PATCH'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/products/bulk-price', () => {
  it('categoryId fuera de rango → 400', async () => {
    expect((await bulkPrice(json('/x', { categoryId: 3_000_000_000, percent: 10 }))).status).toBe(400)
  })

  it('porcentaje fuera de límites → 400', async () => {
    for (const percent of [-100, -150, 1001, 5000]) {
      expect((await bulkPrice(json('/x', { categoryId, percent }))).status).toBe(400)
    }
  })

  it('un aumento que haría pasar un precio del tope → 400 y no escribe nada (no 500)', async () => {
    await db.product.update({ where: { id: productId }, data: { retailPrice: 900_000_000 } })
    for (const apply of [false, true]) {
      const res = await bulkPrice(json('/x', { categoryId, percent: 50, apply }))
      expect(res.status).toBe(400)
    }
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).retailPrice).toBe(900_000_000)
  })
})

describe('otras rutas de admin', () => {
  it('pedido: id gigante → 404, no 500', async () => {
    const res = await orderAction(json('/x', { action: 'seen' }), { params: Promise.resolve({ id: '99999999999999999999' }) })
    expect(res.status).toBe(404)
  })

  it('zona de envío: id y costo fuera de rango → 400', async () => {
    expect((await zoneRoute(json('/x', { id: 3_000_000_000, name: 'Z', cost: '1' }))).status).toBe(400)
    expect((await zoneRoute(json('/x', { name: 'Zona cara', cost: '99999999999' }))).status).toBe(400)
    expect((await zonePatch(json('/x', { id: 3_000_000_000, active: true }, 'PATCH'))).status).toBe(400)
    expect(await db.shippingZone.count()).toBe(0)
  })
})

describe('parseARSToCentavos', () => {
  it('rechaza importes sobre el tope de 10.000.000,00', () => {
    expect(parseARSToCentavos('10.000.000,00')).toBe(1_000_000_000)
    expect(parseARSToCentavos('10.000.000,01')).toBeNull()
    expect(parseARSToCentavos('99999999999')).toBeNull()
  })
})
