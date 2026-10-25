export type PriceableProduct = {
  retailPrice: number
  wholesalePrice: number | null
  wholesaleMinQty: number | null
}

/** Precio unitario en centavos. Mayorista solo si hay precio y mínimo, se alcanza el mínimo y el modo lo permite. */
export function unitPriceFor(
  p: PriceableProduct,
  qty: number,
  wholesaleUnlocked: boolean,
  mode: 'PUBLIC' | 'CODE',
): { unitPrice: number; wholesale: boolean } {
  const wholesale =
    p.wholesalePrice != null &&
    p.wholesaleMinQty != null &&
    qty >= p.wholesaleMinQty &&
    (mode === 'PUBLIC' || wholesaleUnlocked)
  return wholesale
    ? { unitPrice: p.wholesalePrice as number, wholesale: true }
    : { unitPrice: p.retailPrice, wholesale: false }
}
