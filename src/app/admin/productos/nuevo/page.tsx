import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import ProductForm from '../ProductForm'

export const metadata: Metadata = { title: 'Nuevo producto · Serena Mia Admin' }

async function NewProduct() {
  await requireAdmin()
  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
  return (
    <main className="mx-auto max-w-xl">
      <Link href="/admin/productos" className="flex min-h-12 items-center text-base font-semibold text-[#7A4FA0] underline">
        ← Volver a productos
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Nuevo producto</h1>
      <ProductForm categories={categories} />
    </main>
  )
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center">Cargando…</p>}>
      <NewProduct />
    </Suspense>
  )
}
