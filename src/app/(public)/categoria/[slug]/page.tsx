import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { db } from '@/lib/db'
import { CatalogSection, CatalogSkeleton } from '@/components/CatalogSection'
import { HomeHero, HomeHeroSkeleton } from '@/components/HomeHero'

async function Category({ params, searchParams }: Pick<PageProps<'/categoria/[slug]'>, 'params' | 'searchParams'>) {
  await connection()
  const [{ slug }, { q }] = await Promise.all([params, searchParams])
  if (!(await db.category.findUnique({ where: { slug }, select: { id: true } }))) notFound()
  return <CatalogSection initialSlug={slug} initialQuery={typeof q === 'string' ? q : undefined} />
}

export default function CategoryPage({ params, searchParams }: PageProps<'/categoria/[slug]'>) {
  return (
    <>
      <Suspense fallback={<HomeHeroSkeleton />}>
        <HomeHero />
      </Suspense>
      <Suspense fallback={<CatalogSkeleton />}>
        <Category params={params} searchParams={searchParams} />
      </Suspense>
    </>
  )
}
