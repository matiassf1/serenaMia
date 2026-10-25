import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { ProductValidationError, adjustStock, saveProduct } from '@/lib/products'
import { UploadError, saveUpload } from '@/lib/uploads'

const unauthorized = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 })

function errorResponse(e: unknown) {
  if (e instanceof ProductValidationError || e instanceof UploadError) {
    return NextResponse.json({ error: e.message, field: e instanceof ProductValidationError ? e.field : 'image' }, { status: 400 })
  }
  throw e
}

const text = (f: FormData, k: string) => {
  const v = f.get(k)
  return typeof v === 'string' ? v : ''
}
const intOrNaN = (s: string) => (s.trim() === '' ? NaN : Number(s))

/** Crea (sin `id`) o edita (con `id`) un producto. Recibe un formulario con foto opcional. */
export async function POST(req: Request) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return unauthorized()
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  try {
    const idRaw = text(form, 'id')
    const image = form.get('image')
    const imagePath = image instanceof File && image.size > 0 ? await saveUpload(image) : text(form, 'removeImage') === 'on' ? null : undefined
    const qty = text(form, 'wholesaleMinQty')
    const product = await saveProduct(
      {
        id: idRaw ? Number(idRaw) : undefined,
        name: text(form, 'name'),
        description: text(form, 'description'),
        categoryId: intOrNaN(text(form, 'categoryId')),
        retailPrice: text(form, 'retailPrice'),
        wholesalePrice: text(form, 'wholesalePrice'),
        wholesaleMinQty: qty.trim() === '' ? null : Number(qty),
        stock: intOrNaN(text(form, 'stock')),
        lowStockThreshold: text(form, 'lowStockThreshold') === '' ? 3 : intOrNaN(text(form, 'lowStockThreshold')),
        active: text(form, 'active') === 'on',
        imagePath,
      },
      admin.email,
    )
    return NextResponse.json({ ok: true, id: product.id })
  } catch (e) {
    return errorResponse(e)
  }
}

const Patch = z.union([
  z.object({ id: z.number().int(), delta: z.number().int().refine((n) => n !== 0) }),
  z.object({ id: z.number().int(), soldOut: z.literal(true) }),
])

/** Ajustes rápidos de stock: `+1/−1` (delta) o "Sin stock" (soldOut). */
export async function PATCH(req: Request) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return unauthorized()
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  try {
    const body = parsed.data
    if ('soldOut' in body) {
      const p = await db.product.findUnique({ where: { id: body.id }, select: { stock: true } })
      if (!p) return NextResponse.json({ error: 'El producto no existe.' }, { status: 404 })
      if (p.stock > 0) await adjustStock(body.id, -p.stock, 'Marcado sin stock', admin.email)
      return NextResponse.json({ ok: true, stock: 0 })
    }
    const p = await adjustStock(body.id, body.delta, body.delta > 0 ? 'Ajuste rápido +1' : 'Ajuste rápido −1', admin.email)
    return NextResponse.json({ ok: true, stock: p.stock })
  } catch (e) {
    return errorResponse(e)
  }
}
