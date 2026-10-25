import { Suspense } from 'react'
import { db } from '@/lib/db'
import { CategoryNav } from '@/components/CategoryNav'
import { SearchBox } from '@/components/SearchBox'
import { ProductGrid } from '@/components/ProductGrid'

async function Catalog({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const { q } = await searchParams
  const term = typeof q === 'string' ? q : undefined
  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } })
  return (
    <div className="flex flex-col gap-5">
      <SearchBox defaultValue={term} />
      <CategoryNav categories={categories} />
      <h2 className="font-script text-3xl font-bold text-brand-ink">{term ? `Resultados para “${term}”` : 'Nuestros productos'}</h2>
      <ProductGrid q={term} />
    </div>
  )
}

export default function HomePage({ searchParams }: PageProps<'/'>) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Cargando productos…</p>}>
      <Catalog searchParams={searchParams} />
    </Suspense>
  )
}
