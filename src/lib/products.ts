import type { Product } from '@prisma/client'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { parseARSToCentavos } from '@/lib/money'

export class ProductValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'ProductValidationError'
  }
}

export type ProductInput = {
  id?: number
  name: string
  description?: string
  categoryId: number
  /** Texto tal como lo escribe Elías: "1.500,00". */
  retailPrice: string
  wholesalePrice?: string | null
  wholesaleMinQty?: number | null
  stock: number
  lowStockThreshold?: number
  active?: boolean
  /** undefined = no tocar la foto actual. */
  imagePath?: string | null
}

const fail = (message: string, field?: string): never => {
  throw new ProductValidationError(message, field)
}

function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'producto'
  )
}

async function uniqueSlug(name: string, ignoreId?: number): Promise<string> {
  const base = slugify(name)
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    const taken = await db.product.findUnique({ where: { slug }, select: { id: true } })
    if (!taken || taken.id === ignoreId) return slug
  }
}

function isBlank(v: string | null | undefined): boolean {
  return v == null || v.trim() === ''
}

function nonNegInt(v: unknown, label: string, field: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${label} tiene que ser un número entero, 0 o más.`, field)
  return v as number
}

function validate(input: ProductInput) {
  const name = (input.name ?? '').trim()
  if (!name) fail('Escribí el nombre del producto.', 'name')
  if (name.length > 120) fail('El nombre es demasiado largo.', 'name')
  if (!Number.isInteger(input.categoryId)) fail('Elegí una categoría.', 'categoryId')
  const retailPrice = parseARSToCentavos(input.retailPrice ?? '')
  if (retailPrice === null || retailPrice <= 0) fail('El precio no es válido. Ejemplo: 1.500,00', 'retailPrice')
  let wholesalePrice: number | null = null
  let wholesaleMinQty: number | null = null
  const hasWPrice = !isBlank(input.wholesalePrice)
  const hasWQty = input.wholesaleMinQty != null
  if (hasWPrice !== hasWQty) {
    fail('Para el precio mayorista completá el precio y la cantidad mínima, o dejá los dos vacíos.', hasWPrice ? 'wholesaleMinQty' : 'wholesalePrice')
  }
  if (hasWPrice) {
    wholesalePrice = parseARSToCentavos(input.wholesalePrice as string)
    if (wholesalePrice === null || wholesalePrice <= 0) fail('El precio mayorista no es válido.', 'wholesalePrice')
    const q = input.wholesaleMinQty
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 2) fail('La cantidad mínima mayorista tiene que ser 2 o más.', 'wholesaleMinQty')
    wholesaleMinQty = q as number
  }
  return {
    name,
    description: (input.description ?? '').trim(),
    categoryId: input.categoryId,
    retailPrice: retailPrice as number,
    wholesalePrice,
    wholesaleMinQty,
    stock: nonNegInt(input.stock, 'El stock', 'stock'),
    lowStockThreshold: nonNegInt(input.lowStockThreshold ?? 3, 'El aviso de stock bajo', 'lowStockThreshold'),
    active: input.active ?? true,
  }
}

const prices = (p: Pick<Product, 'retailPrice' | 'wholesalePrice' | 'wholesaleMinQty'>) => ({
  retailPrice: p.retailPrice,
  wholesalePrice: p.wholesalePrice,
  wholesaleMinQty: p.wholesaleMinQty,
})

export async function saveProduct(input: ProductInput, adminEmail: string): Promise<Product> {
  const v = validate(input)
  const category = await db.category.findUnique({ where: { id: v.categoryId }, select: { id: true } })
  if (!category) fail('La categoría no existe.', 'categoryId')

  const { stock, ...fields } = v
  const imageData = input.imagePath === undefined ? {} : { imagePath: input.imagePath }

  if (input.id === undefined) {
    const created = await db.$transaction(async (tx) => {
      const slug = await uniqueSlug(v.name)
      const p = await tx.product.create({ data: { ...fields, ...imageData, stock, slug } })
      if (stock > 0) await tx.stockLog.create({ data: { productId: p.id, delta: stock, reason: 'Stock inicial' } })
      return p
    })
    await logAudit(adminEmail, 'product.create', 'Product', String(created.id), null, {
      ...prices(created),
      stock: created.stock,
      name: created.name,
    })
    return created
  }

  const current = await db.product.findUnique({ where: { id: input.id } })
  if (!current) fail('El producto no existe.')
  const cur = current as Product
  const slug = cur.name === v.name ? cur.slug : await uniqueSlug(v.name, cur.id)
  const updated = await db.product.update({ where: { id: cur.id }, data: { ...fields, ...imageData, slug } })

  const before = prices(cur)
  const after = prices(updated)
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    await logAudit(adminEmail, 'product.price', 'Product', String(cur.id), before, after)
  }
  if (stock !== cur.stock) {
    return adjustStock(cur.id, stock - cur.stock, 'Edición del producto', adminEmail)
  }
  return updated
}

/** Suma o resta unidades. Nunca deja el stock en negativo (chequeo atómico en la base). */
export async function adjustStock(productId: number, delta: number, reason: string, adminEmail: string): Promise<Product> {
  if (!Number.isInteger(delta) || delta === 0) fail('El cambio de stock tiene que ser un entero distinto de 0.')
  const rows = await db.$transaction(async (tx) => {
    const r = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE "Product" SET stock = stock + ${delta}
      WHERE id = ${productId} AND stock + ${delta} >= 0
      RETURNING stock`
    if (r.length === 0) return null
    await tx.stockLog.create({ data: { productId, delta, reason } })
    return r
  })
  if (!rows) {
    const exists = await db.product.findUnique({ where: { id: productId }, select: { id: true } })
    if (!exists) fail('El producto no existe.')
    fail('No alcanza el stock: quedaría en negativo.', 'stock')
  }
  const stockAfter = (rows as { stock: number }[])[0].stock
  await logAudit(adminEmail, 'product.stock', 'Product', String(productId), { stock: stockAfter - delta }, { stock: stockAfter })
  return db.product.findUniqueOrThrow({ where: { id: productId } })
}

export type PricePreviewRow = {
  id: number
  name: string
  retailBefore: number
  retailAfter: number
  wholesaleBefore: number | null
  wholesaleAfter: number | null
}

function checkPercent(percent: number) {
  if (!Number.isFinite(percent) || percent === 0 || percent <= -100 || percent > 1000) {
    fail('El porcentaje tiene que ser distinto de 0, mayor que -100 y hasta 1000.', 'percent')
  }
}

const scale = (cents: number, percent: number) => Math.max(1, Math.round((cents * (100 + percent)) / 100))

function previewRows(
  products: Pick<Product, 'id' | 'name' | 'retailPrice' | 'wholesalePrice'>[],
  percent: number,
): PricePreviewRow[] {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    retailBefore: p.retailPrice,
    retailAfter: scale(p.retailPrice, percent),
    wholesaleBefore: p.wholesalePrice,
    wholesaleAfter: p.wholesalePrice === null ? null : scale(p.wholesalePrice, percent),
  }))
}

const scope = (categoryId: number | null) => (categoryId === null ? {} : { categoryId })

/** Calcula el cambio sin escribir nada: es lo que se muestra antes de aplicar. */
export async function previewBulkPrices(categoryId: number | null, percent: number): Promise<PricePreviewRow[]> {
  checkPercent(percent)
  const products = await db.product.findMany({ where: scope(categoryId), orderBy: { name: 'asc' } })
  return previewRows(products, percent)
}

/** Sube/baja precios (minorista y mayorista) de una categoría, o de todas si categoryId es null. */
export async function bulkAdjustPrices(categoryId: number | null, percent: number, adminEmail: string): Promise<number> {
  checkPercent(percent)
  const rows = await db.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: scope(categoryId), orderBy: { name: 'asc' } })
    const plan = previewRows(products, percent)
    for (const r of plan) {
      await tx.product.update({
        where: { id: r.id },
        data: { retailPrice: r.retailAfter, wholesalePrice: r.wholesaleAfter },
      })
    }
    return plan
  })
  for (const r of rows) {
    await logAudit(
      adminEmail,
      'product.price.bulk',
      'Product',
      String(r.id),
      { retailPrice: r.retailBefore, wholesalePrice: r.wholesaleBefore, percent },
      { retailPrice: r.retailAfter, wholesalePrice: r.wholesaleAfter, percent },
    )
  }
  return rows.length
}
