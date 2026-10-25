import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminFromRequest } from '@/lib/auth'
import { dbId } from '@/lib/bounds'
import { ProductValidationError, bulkAdjustPrices, previewBulkPrices } from '@/lib/products'

const Body = z.object({
  categoryId: dbId.nullable(),
  percent: z.number().gt(-100).max(1000),
  apply: z.boolean().optional(),
})

/** Sin `apply`: devuelve la vista previa y no escribe nada. Con `apply: true`: aplica el cambio. */
export async function POST(req: Request) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { categoryId, percent, apply } = parsed.data
  try {
    if (apply) return NextResponse.json({ ok: true, updated: await bulkAdjustPrices(categoryId, percent, admin.email) })
    return NextResponse.json({ ok: true, rows: await previewBulkPrices(categoryId, percent) })
  } catch (e) {
    if (e instanceof ProductValidationError) return NextResponse.json({ error: e.message, field: e.field }, { status: 400 })
    throw e
  }
}
