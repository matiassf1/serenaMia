'use client'

import { useEffect, useState } from 'react'
import { useCart } from './CartProvider'

export function AddToCartButton({ productId, name, disabled }: { productId: number; name: string; disabled: boolean }) {
  const { add } = useCart()
  const [added, setAdded] = useState(false)

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(false), 1500)
    return () => clearTimeout(t)
  }, [added])

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Agregar ${name}`}
      onClick={() => {
        add(productId)
        setAdded(true)
      }}
      className="mt-auto min-h-12 rounded-full bg-brand-deep px-4 text-base font-semibold text-white active:bg-brand-ink disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700"
    >
      {added ? 'Agregado ✓' : 'Agregar'}
    </button>
  )
}
