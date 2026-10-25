import { Suspense } from 'react'
import { CatalogSection, CatalogSkeleton } from '@/components/CatalogSection'
import { HomeHero, HomeHeroSkeleton } from '@/components/HomeHero'
import { WholesaleBanner } from '@/components/WholesaleBanner'

async function Catalog({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const { q } = await searchParams
  return <CatalogSection initialQuery={typeof q === 'string' ? q : undefined} />
}

export default function HomePage({ searchParams }: PageProps<'/'>) {
  return (
    <>
      <Suspense fallback={<HomeHeroSkeleton />}>
        <HomeHero />
      </Suspense>
      <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
        <Suspense>
          <WholesaleBanner />
        </Suspense>
      </div>
      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog searchParams={searchParams} />
      </Suspense>
    </>
  )
}
