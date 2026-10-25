import { connection } from 'next/server'
import { db } from '@/lib/db'
import { getCatalogProducts } from '@/lib/catalog'
import { whatsappDigits } from '@/lib/whatsapp'
import { CatalogBrowser } from './CatalogBrowser'

export function CatalogSkeleton() {
  return (
    <div aria-hidden className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-8 sm:grid-cols-3 md:px-8 xl:grid-cols-4 xl:gap-6">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton animate-shimmer aspect-[3/4] rounded-2xl" />
      ))}
    </div>
  )
}

export async function CatalogSection({ initialSlug, initialQuery }: { initialSlug?: string | null; initialQuery?: string }) {
  await connection()
  const [categories, products, settings] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true } }),
    getCatalogProducts(),
    db.storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: { whatsapp: true } }),
  ])
  return (
    <section id="catalogo" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 pb-8 pt-6 md:px-8">
      <CatalogBrowser
        categories={categories}
        products={products}
        initialSlug={initialSlug ?? null}
        initialQuery={initialQuery ?? ''}
        whatsappHref={`https://wa.me/${whatsappDigits(settings.whatsapp)}`}
      />
    </section>
  )
}
