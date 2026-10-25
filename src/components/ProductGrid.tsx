import { db } from '@/lib/db'
import { ProductCard } from './ProductCard'

export async function ProductGrid({ q, categorySlug }: { q?: string; categorySlug?: string }) {
  const term = q?.trim()
  const products = await db.product.findMany({
    where: {
      active: true,
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(term ? { name: { contains: term, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    select: { id: true, name: true, retailPrice: true, stock: true, lowStockThreshold: true, imagePath: true },
  })

  if (products.length === 0) {
    return (
      <p className="rounded-2xl bg-blush p-6 text-center text-base">
        No encontramos productos{term ? ` para “${term}”` : ''}. Probá con otra palabra o mirá todo el catálogo.
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </ul>
  )
}
