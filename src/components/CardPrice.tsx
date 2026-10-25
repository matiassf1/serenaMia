'use client'

import { formatPrice } from '@/lib/money'
import { unitPriceFor } from '@/lib/pricing'
import { useCart } from './CartProvider'

type Props = {
  productId: number
  retailPrice: number
  wholesalePrice: number | null
  wholesaleMinQty: number | null
}

/**
 * Precio de la tarjeta. Si el servidor mandó el mayorista (modo PUBLIC o código válido) se informa "Mayorista desde N";
 * al llegar al mínimo en el carrito pasa a ser el precio principal, con el mismo cálculo que placeOrder (unitPriceFor).
 */
export function CardPrice({ productId, retailPrice, wholesalePrice, wholesaleMinQty }: Props) {
  const { items } = useCart()
  const quantity = items.find((i) => i.productId === productId)?.quantity ?? 0
  const p = { retailPrice, wholesalePrice, wholesaleMinQty }
  const { unitPrice, wholesale } = unitPriceFor(p, quantity, true, 'PUBLIC')
  const hasWholesale = wholesalePrice != null && wholesaleMinQty != null

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-lg font-bold text-brand-ink">
        {formatPrice(unitPrice)}
        {wholesale && <span className="ml-2 text-sm font-normal text-muted line-through">{formatPrice(retailPrice)}</span>}
      </p>
      {hasWholesale && (
        <p className="text-sm font-medium text-violet">
          {wholesale
            ? 'Precio mayorista aplicado'
            : `Mayorista ${formatPrice(wholesalePrice)} desde ${wholesaleMinQty} u.`}
        </p>
      )}
    </div>
  )
}
