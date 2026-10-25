import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { CategoryNav } from '@/components/CategoryNav'
import { SearchBox } from '@/components/SearchBox'
import { ProductGrid } from '@/components/ProductGrid'

async function CategoryCatalog({ params }: Pick<PageProps<'/categoria/[slug]'>, 'params'>) {
  const { slug } = await params
  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } })
  const current = categories.find((c) => c.slug === slug)
  if (!current) notFound()
  return (
    <div className="flex flex-col gap-5">
      <SearchBox />
      <CategoryNav categories={categories} activeSlug={slug} />
      <h2 className="font-script text-3xl font-bold text-brand-ink">{current.name}</h2>
      <ProductGrid categorySlug={slug} />
    </div>
  )
}

export default function CategoryPage({ params }: PageProps<'/categoria/[slug]'>) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Cargando productos…</p>}>
      <CategoryCatalog params={params} />
    </Suspense>
  )
}
