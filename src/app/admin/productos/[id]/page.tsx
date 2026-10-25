import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import ProductForm from '../ProductForm'

export const metadata: Metadata = { title: 'Editar producto · Serena Mia Admin' }

// Formato que acepta el formulario: 150000 → "1.500,00".
const ars = (cents: number | null) =>
  cents === null ? '' : (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function EditProduct({ params }: Pick<PageProps<'/admin/productos/[id]'>, 'params'>) {
  await requireAdmin()
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [product, categories] = await Promise.all([
    db.product.findUnique({ where: { id: Number(id) } }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ])
  if (!product) notFound()
  return (
    <main className="mx-auto max-w-xl">
      <Link href="/admin/productos" className="flex min-h-12 items-center text-base font-semibold text-[#7A4FA0] underline">
        ← Volver a productos
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Editar producto</h1>
      <ProductForm
        categories={categories}
        product={{
          id: product.id,
          name: product.name,
          description: product.description,
          categoryId: product.categoryId,
          retailPrice: ars(product.retailPrice),
          wholesalePrice: ars(product.wholesalePrice),
          wholesaleMinQty: product.wholesaleMinQty === null ? '' : String(product.wholesaleMinQty),
          stock: product.stock,
          lowStockThreshold: product.lowStockThreshold,
          active: product.active,
          imagePath: product.imagePath,
        }}
      />
    </main>
  )
}

export default function EditProductPage({ params }: PageProps<'/admin/productos/[id]'>) {
  return (
    <Suspense fallback={<p className="py-10 text-center">Cargando…</p>}>
      <EditProduct params={params} />
    </Suspense>
  )
}
