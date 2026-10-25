import Image from 'next/image'
import { AddToCartButton } from './AddToCartButton'
import { CardPrice } from './CardPrice'

export type CardProduct = {
  id: number
  name: string
  retailPrice: number
  /** null si el producto no tiene mayorista o si todavía no se puede ver (modo CODE sin desbloquear). */
  wholesalePrice?: number | null
  wholesaleMinQty?: number | null
  stock: number
  lowStockThreshold: number
  imagePath: string | null
}

export function stockState(p: Pick<CardProduct, 'stock' | 'lowStockThreshold'>) {
  if (p.stock <= 0) return { label: 'Sin stock', cls: 'bg-gray-100 text-gray-800', available: false }
  if (p.stock <= p.lowStockThreshold) return { label: 'Últimas unidades', cls: 'bg-amber-100 text-amber-900', available: true }
  return { label: 'En stock', cls: 'bg-green-100 text-green-800', available: true }
}

export function ProductCard({ product }: { product: CardProduct }) {
  const state = stockState(product)
  return (
    <li
      data-testid="product-card"
      className="flex flex-col overflow-hidden rounded-2xl border border-blush-border bg-white shadow-sm"
    >
      <div className="relative aspect-square bg-blush">
        {product.imagePath ? (
          <Image
            src={`/api/uploads/${product.imagePath}`}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <Image src="/logo.png" alt="" width={72} height={72} className="absolute left-1/2 top-1/2 size-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="text-base font-semibold leading-snug">{product.name}</h3>
        <CardPrice
          productId={product.id}
          retailPrice={product.retailPrice}
          wholesalePrice={product.wholesalePrice ?? null}
          wholesaleMinQty={product.wholesaleMinQty ?? null}
        />
        <p className={`w-fit rounded-full px-2.5 py-0.5 text-sm font-medium ${state.cls}`}>{state.label}</p>
        <AddToCartButton productId={product.id} name={product.name} disabled={!state.available} />
      </div>
    </li>
  )
}
