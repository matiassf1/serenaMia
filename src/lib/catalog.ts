import { db } from '@/lib/db'
import { getWholesaleAccess } from '@/lib/wholesale'
import type { CardProduct } from '@/components/ProductCard'

export type CatalogProduct = CardProduct & { categoryId: number }

/** Todos los productos activos, con el precio mayorista ya filtrado en el servidor (nunca viaja al cliente si no corresponde). */
export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  const [access, products] = await Promise.all([
    getWholesaleAccess(),
    db.product.findMany({
      where: { active: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        categoryId: true,
        retailPrice: true,
        wholesalePrice: true,
        wholesaleMinQty: true,
        stock: true,
        lowStockThreshold: true,
        imagePath: true,
      },
    }),
  ])
  return products.map((p) => (access.visible ? p : { ...p, wholesalePrice: null, wholesaleMinQty: null }))
}
