'use client'

import { useCart } from './CartProvider'

export const OPEN_CART_EVENT = 'sm:open-cart'

/** Abre el carrito (el <dialog> vive en CartDrawer). Se usa en la barra superior y en la barra inferior del celular. */
export function CartButton({ className, children }: { className: string; children: (count: number) => React.ReactNode }) {
  const { count } = useCart()
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CART_EVENT))} className={className}>
      {children(count)}
    </button>
  )
}
