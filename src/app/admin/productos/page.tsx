import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatARS } from '@/lib/money'
import BulkPrice from './BulkPrice'
import StockControls from './StockControls'

export const metadata: Metadata = { title: 'Productos · Serena Mia Admin' }

const pill = (active: boolean) =>
  `flex min-h-12 flex-1 items-center justify-center rounded-xl border px-3 text-base font-semibold ${
    active ? 'border-[#C2398C] bg-[#FDECF5] text-[#8A1F60]' : 'border-[#7A4FA0]/40 bg-white text-[#4A3A52]'
  }`

async function Products({ searchParams }: Pick<PageProps<'/admin/productos'>, 'searchParams'>) {
  await requireAdmin()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const lowOnly = sp.filtro === 'bajo'

  const [all, categories] = await Promise.all([
    db.product.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      include: { category: { select: { name: true } } },
    }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ])
  const isLow = (p: { stock: number; lowStockThreshold: number }) => p.stock <= p.lowStockThreshold
  const lowCount = all.filter(isLow).length
  const products = lowOnly ? all.filter(isLow) : all

  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Link href="/admin/productos/nuevo" className="flex min-h-12 items-center rounded-xl bg-[#C2398C] px-4 text-base font-semibold text-white">
          + Nuevo producto
        </Link>
      </div>

      {lowCount > 0 && (
        <p role="status" data-testid="low-stock-alert" className="rounded-xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-900">
          ⚠ {lowCount} producto{lowCount === 1 ? '' : 's'} con stock bajo o sin stock
        </p>
      )}

      <form action="/admin/productos" method="get" role="search" className="flex gap-2">
        <input type="search" name="q" defaultValue={q} aria-label="Buscar producto" placeholder="Buscar producto…" className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base" />
        {lowOnly && <input type="hidden" name="filtro" value="bajo" />}
        <button type="submit" className="min-h-12 rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base font-semibold text-[#7A4FA0]">
          Buscar
        </button>
      </form>

      <div className="flex gap-2">
        <Link href={q ? `/admin/productos?q=${encodeURIComponent(q)}` : '/admin/productos'} className={pill(!lowOnly)} aria-current={!lowOnly ? 'true' : undefined}>
          Todos
        </Link>
        <Link href={`/admin/productos?filtro=bajo${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={pill(lowOnly)} aria-current={lowOnly ? 'true' : undefined}>
          Stock bajo
        </Link>
      </div>

      <BulkPrice categories={categories} />

      {products.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-base">No hay productos para mostrar.</p>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <li key={p.id} data-testid="admin-product" className="rounded-2xl border border-[#7A4FA0]/20 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-bold">{p.name}</h2>
                  <p className="text-sm text-[#4A3A52]">
                    {p.category.name}
                    {!p.active && ' · Oculto en la tienda'}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#8A1F60]">{formatARS(p.retailPrice)}</p>
                </div>
                <Link href={`/admin/productos/${p.id}`} aria-label={`Editar ${p.name}`} className="flex min-h-12 shrink-0 items-center rounded-xl border border-[#7A4FA0]/40 px-4 text-base font-semibold text-[#7A4FA0]">
                  Editar
                </Link>
              </div>
              {p.stock <= 0 ? (
                <p className="mt-2 w-fit rounded-full bg-gray-200 px-3 py-1 text-sm font-semibold text-gray-900">Sin stock</p>
              ) : isLow(p) ? (
                <p data-testid="low-stock-badge" className="mt-2 w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                  Stock bajo
                </p>
              ) : null}
              <StockControls id={p.id} name={p.name} stock={p.stock} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default function ProductsPage({ searchParams }: PageProps<'/admin/productos'>) {
  return (
    <Suspense fallback={<p className="py-10 text-center">Cargando productos…</p>}>
      <Products searchParams={searchParams} />
    </Suspense>
  )
}
