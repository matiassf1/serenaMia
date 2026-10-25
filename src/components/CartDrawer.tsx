'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { formatPrice } from '@/lib/money'
import { MAX_QTY } from '@/lib/cart'
import { cartUnitPrice, useCart, useCartProducts } from './CartProvider'

const stepBtn =
  'flex size-11 items-center justify-center rounded-full border-2 border-brand-deep bg-white text-xl font-bold text-brand-ink active:bg-blush disabled:border-gray-300 disabled:text-gray-600'

export function CartDrawer() {
  const { items, count, setQty, remove } = useCart()
  const { byId, ready, estimatedTotal } = useCartProducts(items)
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="fixed bottom-4 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-brand-deep px-5 text-base font-semibold text-white shadow-lg active:bg-brand-ink"
      >
        <span aria-hidden>🛍️</span>
        <span>Carrito</span>
        {count > 0 && (
          <span className="min-w-6 rounded-full bg-white px-1.5 text-center text-sm font-bold text-brand-ink">{count}</span>
        )}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="cart-title"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close()
        }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-white p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="cart-title" className="font-script text-3xl font-bold text-brand-ink">
              Tu carrito
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="min-h-11 rounded-full px-4 text-base font-semibold text-brand-ink underline"
            >
              Cerrar
            </button>
          </div>

          {items.length === 0 ? (
            <p className="rounded-2xl bg-blush p-5 text-center text-base">
              Todavía no agregaste nada. Elegí un producto y tocá “Agregar”.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((it) => {
                const p = byId.get(it.productId)
                const gone = ready && (!p || p.stock <= 0)
                const price = p ? cartUnitPrice(p, it.quantity) : null
                return (
                  <li key={it.productId} className="flex flex-col gap-2 rounded-2xl border border-blush-border p-3">
                    <p className="text-base font-semibold">{p?.name ?? (ready ? 'Producto no disponible' : 'Cargando…')}</p>
                    {gone ? (
                      <p className="text-sm text-muted">Este producto ya no está disponible.</p>
                    ) : (
                      price && (
                        <p className="text-base text-muted">
                          {formatPrice(price.unitPrice)} c/u
                          {price.wholesale && <span className="font-semibold text-violet"> · precio mayorista</span>}
                          {!price.wholesale && p?.wholesalePrice != null && p.wholesaleMinQty != null && (
                            <span className="block text-sm">
                              Desde {p.wholesaleMinQty} unidades: {formatPrice(p.wholesalePrice)} c/u
                            </span>
                          )}
                        </p>
                      )
                    )}
                    <div className="flex items-center gap-2">
                      {!gone && (
                        <>
                          <button
                            type="button"
                            aria-label={`Sacar uno de ${p?.name ?? 'este producto'}`}
                            onClick={() => setQty(it.productId, it.quantity - 1)}
                            className={stepBtn}
                          >
                            −
                          </button>
                          <span aria-live="polite" className="min-w-8 text-center text-lg font-semibold">
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Agregar uno más de ${p?.name ?? 'este producto'}`}
                            disabled={it.quantity >= Math.min(MAX_QTY, p?.stock ?? MAX_QTY)}
                            onClick={() => setQty(it.productId, it.quantity + 1)}
                            className={stepBtn}
                          >
                            +
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(it.productId)}
                        className="ml-auto min-h-11 rounded-full px-3 text-base font-semibold text-brand-ink underline"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {items.length > 0 && (
            <>
              {ready && (
                <p className="text-lg font-bold">
                  Total: {formatPrice(estimatedTotal)}
                  <span className="block text-sm font-normal text-muted">
                    El envío y el precio final los confirmamos al hacer el pedido.
                  </span>
                </p>
              )}
              <Link
                href="/checkout"
                onClick={() => dialog.current?.close()}
                className="flex min-h-12 items-center justify-center rounded-full bg-brand-deep px-4 text-base font-semibold text-white active:bg-brand-ink"
              >
                Continuar con el pedido
              </Link>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
