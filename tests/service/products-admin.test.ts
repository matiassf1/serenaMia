import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { createSession, hashPassword, SESSION_COOKIE } from '@/lib/auth'
import {
  ProductValidationError,
  adjustStock,
  bulkAdjustPrices,
  previewBulkPrices,
  saveProduct,
} from '@/lib/products'
import { UploadError, saveUpload } from '@/lib/uploads'
import { GET as serveUpload } from '@/app/api/uploads/[...path]/route'
import { POST as createProduct } from '@/app/api/admin/products/route'
import { POST as bulkPrice } from '@/app/api/admin/products/bulk-price/route'
import { resetDb } from './helpers'

const ADMIN = 'elias@serenamia.test'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let uploadDir: string
beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'sm-uploads-'))
  process.env.UPLOAD_DIR = uploadDir
})
afterAll(async () => {
  await rm(uploadDir, { recursive: true, force: true })
})
beforeEach(async () => {
  await resetDb()
})

async function category(name = 'Insumos') {
  return db.category.create({ data: { name, slug: name.toLowerCase() } })
}
const base = (categoryId: number) => ({
  name: 'Esmalte rosa',
  categoryId,
  retailPrice: '1.500,00',
  stock: 5,
  lowStockThreshold: 3,
  active: true,
})

describe('saveProduct', () => {
  it('crea producto con precio "1.500,00" → 150000 centavos y deja registro', async () => {
    const cat = await category()
    const p = await saveProduct(base(cat.id), ADMIN)
    expect(p.retailPrice).toBe(150000)
    expect(p.slug).toBe('esmalte-rosa')
    const logs = await db.stockLog.findMany({ where: { productId: p.id } })
    expect(logs.map((l) => l.delta)).toEqual([5])
    const audit = await db.auditLog.findMany({ where: { entity: 'Product', entityId: String(p.id) } })
    expect(audit).toHaveLength(1)
    expect(audit[0].adminEmail).toBe(ADMIN)
  })

  it('slug repetido recibe sufijo', async () => {
    const cat = await category()
    const a = await saveProduct(base(cat.id), ADMIN)
    const b = await saveProduct(base(cat.id), ADMIN)
    expect(a.slug).not.toBe(b.slug)
  })

  it('mayorista sin mínimo (o mínimo sin precio) → error de validación', async () => {
    const cat = await category()
    await expect(saveProduct({ ...base(cat.id), wholesalePrice: '1.000,00' }, ADMIN)).rejects.toBeInstanceOf(
      ProductValidationError,
    )
    await expect(saveProduct({ ...base(cat.id), wholesaleMinQty: 6 }, ADMIN)).rejects.toBeInstanceOf(
      ProductValidationError,
    )
    expect(await db.product.count()).toBe(0)
  })

  it('rechaza precio ilegible, precio 0, stock negativo o decimal y categoría inexistente', async () => {
    const cat = await category()
    for (const bad of [
      { retailPrice: 'abc' },
      { retailPrice: '0' },
      { stock: -1 },
      { stock: 1.5 },
      { categoryId: cat.id + 99 },
      { name: '   ' },
    ]) {
      await expect(saveProduct({ ...base(cat.id), ...bad }, ADMIN)).rejects.toBeInstanceOf(ProductValidationError)
    }
  })

  it('editar: cambio de precio y de stock escriben AuditLog antes/después y StockLog', async () => {
    const cat = await category()
    const p = await saveProduct(base(cat.id), ADMIN)
    await saveProduct({ ...base(cat.id), id: p.id, retailPrice: '2.000,00', stock: 2, stockOriginal: 5 }, 'otra@serenamia.test')
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(after.retailPrice).toBe(200000)
    expect(after.stock).toBe(2)
    const audit = await db.auditLog.findMany({ where: { entityId: String(p.id) }, orderBy: { id: 'asc' } })
    const price = audit.find((a) => a.action === 'product.price')!
    expect(price.adminEmail).toBe('otra@serenamia.test')
    expect(price.before).toMatchObject({ retailPrice: 150000 })
    expect(price.after).toMatchObject({ retailPrice: 200000 })
    const stock = audit.find((a) => a.action === 'product.stock')!
    expect(stock.before).toMatchObject({ stock: 5 })
    expect(stock.after).toMatchObject({ stock: 2 })
    const logs = await db.stockLog.findMany({ where: { productId: p.id }, orderBy: { id: 'asc' } })
    expect(logs.map((l) => l.delta)).toEqual([5, -3])
  })

  it('editar con un formulario viejo NO pisa el stock vivo: se aplica solo el cambio que hizo la persona', async () => {
    const cat = await category()
    const p = await saveProduct({ ...base(cat.id), stock: 10 }, ADMIN)
    // El formulario se abre con stock 10; antes de guardar se venden 3 unidades.
    await db.product.update({ where: { id: p.id }, data: { stock: 7 } })
    await saveProduct({ ...base(cat.id), id: p.id, name: 'Nombre nuevo', stock: 10, stockOriginal: 10 }, ADMIN)
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(after.name).toBe('Nombre nuevo')
    expect(after.stock).toBe(7)
    expect(await db.stockLog.count({ where: { productId: p.id, reason: 'Edición del producto' } })).toBe(0)
  })

  it('editar el stock en un formulario viejo aplica la diferencia sobre el stock vivo', async () => {
    const cat = await category()
    const p = await saveProduct({ ...base(cat.id), stock: 10 }, ADMIN)
    await db.product.update({ where: { id: p.id }, data: { stock: 7 } }) // se vendieron 3
    await saveProduct({ ...base(cat.id), id: p.id, stock: 12, stockOriginal: 10 }, ADMIN) // la persona sumó 2
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(9)
    const log = await db.stockLog.findFirstOrThrow({ where: { productId: p.id, reason: 'Edición del producto' } })
    expect(log.delta).toBe(2)
  })

  it('una resta que ya no alcanza (se vendió mientras editaba) falla sin tocar nada', async () => {
    const cat = await category()
    const p = await saveProduct({ ...base(cat.id), stock: 10 }, ADMIN)
    await db.product.update({ where: { id: p.id }, data: { stock: 2 } })
    await expect(
      saveProduct({ ...base(cat.id), id: p.id, name: 'Otro nombre', stock: 3, stockOriginal: 10 }, ADMIN),
    ).rejects.toBeInstanceOf(ProductValidationError)
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(after.stock).toBe(2)
    expect(after.name).not.toBe('Otro nombre')
  })

  it('sin stockOriginal en una edición, el stock no se toca', async () => {
    const cat = await category()
    const p = await saveProduct({ ...base(cat.id), stock: 10 }, ADMIN)
    await saveProduct({ ...base(cat.id), id: p.id, stock: 99 }, ADMIN)
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10)
  })

  it('editar sin tocar precio ni stock no agrega auditoría de precio/stock', async () => {
    const cat = await category()
    const p = await saveProduct(base(cat.id), ADMIN)
    await saveProduct({ ...base(cat.id), id: p.id, name: 'Esmalte rosa pastel' }, ADMIN)
    const audit = await db.auditLog.findMany({ where: { entityId: String(p.id) } })
    expect(audit.map((a) => a.action)).toEqual(['product.create'])
  })
})

describe('adjustStock', () => {
  it('suma/resta, escribe StockLog y AuditLog con email y antes/después', async () => {
    const cat = await category()
    const p = await saveProduct(base(cat.id), ADMIN)
    const res = await adjustStock(p.id, -1, 'Venta en el local', ADMIN)
    expect(res.stock).toBe(4)
    const logs = await db.stockLog.findMany({ where: { productId: p.id }, orderBy: { id: 'asc' } })
    expect(logs.at(-1)).toMatchObject({ delta: -1, reason: 'Venta en el local' })
    const a = (await db.auditLog.findMany({ where: { action: 'product.stock' } })).at(-1)!
    expect(a).toMatchObject({ adminEmail: ADMIN, entityId: String(p.id) })
    expect(a.before).toMatchObject({ stock: 5 })
    expect(a.after).toMatchObject({ stock: 4 })
  })

  it('un delta que dejaría stock negativo falla y no cambia nada', async () => {
    const cat = await category()
    const p = await saveProduct(base(cat.id), ADMIN)
    await expect(adjustStock(p.id, -6, 'x', ADMIN)).rejects.toThrow()
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(5)
    expect(await db.stockLog.count({ where: { productId: p.id } })).toBe(1)
  })

  it('rechaza delta 0 / no entero y producto inexistente', async () => {
    const cat = await category()
    const p = await saveProduct(base(cat.id), ADMIN)
    await expect(adjustStock(p.id, 0, 'x', ADMIN)).rejects.toThrow()
    await expect(adjustStock(p.id, 1.5, 'x', ADMIN)).rejects.toThrow()
    await expect(adjustStock(p.id + 99, 1, 'x', ADMIN)).rejects.toThrow()
  })

  it('dos bajadas concurrentes de la última unidad: solo una gana', async () => {
    const cat = await category()
    const p = await saveProduct({ ...base(cat.id), stock: 1 }, ADMIN)
    const r = await Promise.allSettled([adjustStock(p.id, -1, 'a', ADMIN), adjustStock(p.id, -1, 'b', ADMIN)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(0)
  })
})

describe('bulkAdjustPrices', () => {
  async function seed() {
    const a = await category('Insumos')
    const b = await category('Cosmetologia')
    const p1 = await saveProduct({ ...base(a.id), name: 'Uno', retailPrice: '1.000,00', wholesalePrice: '800,00', wholesaleMinQty: 6 }, ADMIN)
    const p2 = await saveProduct({ ...base(a.id), name: 'Dos', retailPrice: '333,33' }, ADMIN)
    const p3 = await saveProduct({ ...base(b.id), name: 'Tres', retailPrice: '1.000,00' }, ADMIN)
    return { a, b, p1, p2, p3 }
  }

  it('+10 % sube solo esa categoría (minorista y mayorista), redondea a centavos enteros', async () => {
    const { a, p1, p2, p3 } = await seed()
    const n = await bulkAdjustPrices(a.id, 10, ADMIN)
    expect(n).toBe(2)
    const [r1, r2, r3] = await Promise.all([p1, p2, p3].map((p) => db.product.findUniqueOrThrow({ where: { id: p.id } })))
    expect(r1.retailPrice).toBe(110000)
    expect(r1.wholesalePrice).toBe(88000)
    expect(r2.retailPrice).toBe(36666) // 33333 * 1.1 = 36666.3
    expect(r3.retailPrice).toBe(100000)
  })

  it('categoría null = todas; escribe un AuditLog por producto con email y antes/después', async () => {
    const { p1 } = await seed()
    expect(await bulkAdjustPrices(null, -10, ADMIN)).toBe(3)
    const audit = await db.auditLog.findMany({ where: { action: 'product.price.bulk', entityId: String(p1.id) } })
    expect(audit).toHaveLength(1)
    expect(audit[0].adminEmail).toBe(ADMIN)
    expect(audit[0].before).toMatchObject({ retailPrice: 100000, wholesalePrice: 80000 })
    expect(audit[0].after).toMatchObject({ retailPrice: 90000, wholesalePrice: 72000 })
  })

  it('la vista previa no escribe nada y coincide con lo que se aplica', async () => {
    const { a, p1 } = await seed()
    const preview = await previewBulkPrices(a.id, 10)
    expect(preview).toHaveLength(2)
    expect(preview.find((r) => r.id === p1.id)).toMatchObject({ retailBefore: 100000, retailAfter: 110000 })
    expect((await db.product.findUniqueOrThrow({ where: { id: p1.id } })).retailPrice).toBe(100000)
    expect(await db.auditLog.count({ where: { action: 'product.price.bulk' } })).toBe(0)
    await bulkAdjustPrices(a.id, 10, ADMIN)
    expect((await db.product.findUniqueOrThrow({ where: { id: p1.id } })).retailPrice).toBe(110000)
  })

  it('rechaza porcentaje 0, no finito, ≤ -100 o > 1000', async () => {
    await seed()
    for (const bad of [0, NaN, Infinity, -100, -150, 1001]) {
      await expect(bulkAdjustPrices(null, bad, ADMIN)).rejects.toBeInstanceOf(ProductValidationError)
    }
  })
})

describe('saveUpload', () => {
  const file = (bytes: Buffer, name: string, type: string) => new File([new Uint8Array(bytes)], name, { type })

  it('guarda un PNG con nombre no adivinable bajo UPLOAD_DIR y devuelve ruta relativa', async () => {
    const a = await saveUpload(file(PNG, 'foto.png', 'image/png'))
    const b = await saveUpload(file(PNG, 'foto.png', 'image/png'))
    expect(a).toMatch(/^[0-9a-f]{32}\.png$/)
    expect(a).not.toBe(b)
    expect(a).not.toContain('foto')
    expect((await readFile(path.join(uploadDir, a))).equals(PNG)).toBe(true)
  })

  it('acepta JPG y WebP por contenido', async () => {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20)])
    expect(await saveUpload(file(jpg, 'a.jpg', 'image/jpeg'))).toMatch(/\.jpg$/)
    expect(await saveUpload(file(webp, 'a.webp', 'image/webp'))).toMatch(/\.webp$/)
  })

  it('rechaza .exe, tipo declarado falso, vacío y > 5 MB, sin dejar archivos', async () => {
    const before = (await readdir(uploadDir)).length
    await expect(saveUpload(file(Buffer.from('MZ\x90\x00'), 'virus.exe', 'application/x-msdownload'))).rejects.toBeInstanceOf(UploadError)
    await expect(saveUpload(file(Buffer.from('MZ\x90\x00'), 'virus.png', 'image/png'))).rejects.toBeInstanceOf(UploadError)
    await expect(saveUpload(file(Buffer.alloc(0), 'v.png', 'image/png'))).rejects.toBeInstanceOf(UploadError)
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])
    await expect(saveUpload(file(big, 'big.png', 'image/png'))).rejects.toBeInstanceOf(UploadError)
    expect((await readdir(uploadDir)).length).toBe(before)
  })
})

describe('GET /api/uploads/[...path]', () => {
  const get = (segs: string[]) =>
    serveUpload(new Request('http://localhost/api/uploads/' + segs.join('/')), { params: Promise.resolve({ path: segs }) })

  it('sirve el archivo con su content-type', async () => {
    const name = await saveUpload(new File([new Uint8Array(PNG)], 'x.png', { type: 'image/png' }))
    const res = await get([name])
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true)
  })

  it('404 ante traversal, inexistente o extensión no permitida', async () => {
    expect((await get(['..', 'etc', 'passwd'])).status).toBe(404)
    expect((await get(['%2e%2e', 'x.png'])).status).toBe(404)
    expect((await get(['nada.png'])).status).toBe(404)
    expect((await get(['a.txt'])).status).toBe(404)
  })
})

describe('rutas admin', () => {
  async function authedCookie() {
    const admin = await db.adminUser.create({ data: { email: ADMIN, passwordHash: await hashPassword('x') } })
    return `${SESSION_COOKIE}=${createSession(admin.id)}`
  }

  it('sin sesión: 401 en productos y bulk-price', async () => {
    const r1 = await createProduct(new Request('http://localhost/api/admin/products', { method: 'POST', body: new FormData() }))
    const r2 = await bulkPrice(
      new Request('http://localhost/api/admin/products/bulk-price', { method: 'POST', body: '{}' }),
    )
    expect(r1.status).toBe(401)
    expect(r2.status).toBe(401)
  })

  it('bulk-price: sin apply devuelve vista previa y no escribe; con apply escribe', async () => {
    const cookie = await authedCookie()
    const cat = await category()
    const p = await saveProduct({ ...base(cat.id), retailPrice: '1.000,00' }, ADMIN)
    const call = (body: unknown) =>
      bulkPrice(
        new Request('http://localhost/api/admin/products/bulk-price', {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    const prev = await call({ categoryId: cat.id, percent: 10 })
    expect(prev.status).toBe(200)
    expect((await prev.json()).rows[0]).toMatchObject({ id: p.id, retailBefore: 100000, retailAfter: 110000 })
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).retailPrice).toBe(100000)
    const done = await call({ categoryId: cat.id, percent: 10, apply: true })
    expect((await done.json()).updated).toBe(1)
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).retailPrice).toBe(110000)
    expect((await call({ categoryId: cat.id, percent: 0, apply: true })).status).toBe(400)
  })

  it('crear producto con foto por formulario guarda imagePath relativo y audita con el email de la sesión', async () => {
    const cookie = await authedCookie()
    const cat = await category()
    const form = new FormData()
    form.set('name', 'Con foto')
    form.set('categoryId', String(cat.id))
    form.set('retailPrice', '1.500,00')
    form.set('stock', '4')
    form.set('lowStockThreshold', '3')
    form.set('active', 'on')
    form.set('image', new File([new Uint8Array(PNG)], 'f.png', { type: 'image/png' }))
    const res = await createProduct(new Request('http://localhost/api/admin/products', { method: 'POST', headers: { cookie }, body: form }))
    expect(res.status).toBe(200)
    const p = await db.product.findFirstOrThrow({ where: { name: 'Con foto' } })
    expect(p.imagePath).toMatch(/^[0-9a-f]{32}\.png$/)
    expect((await db.auditLog.findFirstOrThrow({ where: { entityId: String(p.id) } })).adminEmail).toBe(ADMIN)
    const bad = new FormData()
    bad.set('name', 'Malo')
    bad.set('categoryId', String(cat.id))
    bad.set('retailPrice', 'abc')
    bad.set('stock', '1')
    const r2 = await createProduct(new Request('http://localhost/api/admin/products', { method: 'POST', headers: { cookie }, body: bad }))
    expect(r2.status).toBe(400)
  })

  it('editar por formulario con el stock con el que se abrió (stockOriginal): no resucita unidades vendidas', async () => {
    const cookie = await authedCookie()
    const cat = await category()
    const p = await saveProduct({ ...base(cat.id), stock: 10 }, ADMIN)
    await db.product.update({ where: { id: p.id }, data: { stock: 7 } }) // 3 vendidas después de abrir el formulario
    const form = new FormData()
    form.set('id', String(p.id))
    form.set('name', 'Solo cambio el nombre')
    form.set('categoryId', String(cat.id))
    form.set('retailPrice', '1.500,00')
    form.set('stock', '10')
    form.set('stockOriginal', '10')
    form.set('lowStockThreshold', '3')
    form.set('active', 'on')
    const res = await createProduct(new Request('http://localhost/api/admin/products', { method: 'POST', headers: { cookie }, body: form }))
    expect(res.status).toBe(200)
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(after.name).toBe('Solo cambio el nombre')
    expect(after.stock).toBe(7)
  })
})
