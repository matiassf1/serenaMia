'use client'

import { useEffect, useState } from 'react'
import { MAX_QTY } from '@/lib/cart'
import { formatPrice } from '@/lib/money'
import { unitPriceFor } from '@/lib/pricing'
import { useCart } from './CartProvider'

export type WholesaleRow = {
  id: number
  name: string
  stock: number
  retailPrice: number
  wholesalePrice: number | null
  wholesaleMinQty: number | null
}

function QtyAdd({ row }: { row: WholesaleRow }) {
  const { add } = useCart()
  const max = Math.min(MAX_QTY, row.stock)
  const [qty, setQty] = useState(String(Math.min(row.wholesaleMinQty ?? 1, max) || 1))
  const [added, setAdded] = useState(false)

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(false), 1500)
    return () => clearTimeout(t)
  }, [added])

  if (row.stock <= 0) return <span className="text-sm font-medium text-muted">Sin stock</span>

  const n = Number(qty)
  const valid = Number.isInteger(n) && n >= 1 && n <= max
  // Mismo cálculo que placeOrder: el precio que se muestra con esa cantidad es el que se cobra.
  const { unitPrice, wholesale } = unitPriceFor(row, valid ? n : 1, true, 'PUBLIC')

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          step={1}
          value={qty}
          aria-label={`Cantidad de ${row.name}`}
          aria-invalid={valid ? undefined : true}
          onChange={(e) => setQty(e.target.value)}
          className="min-h-11 w-20 rounded-xl border-2 border-blush-border bg-white px-2 text-center text-base"
        />
        <button
          type="button"
          disabled={!valid}
          aria-label={`Agregar ${row.name} al carrito`}
          onClick={() => {
            add(row.id, n)
            setAdded(true)
          }}
          className="min-h-11 rounded-full bg-brand-deep px-4 text-base font-semibold text-white active:bg-brand-ink disabled:bg-gray-200 disabled:text-gray-700"
        >
          {added ? 'Agregado ✓' : 'Agregar'}
        </button>
      </div>
      <p className={`text-sm ${wholesale ? 'font-semibold text-violet' : 'text-muted'}`}>
        {valid ? `${formatPrice(unitPrice)} c/u${wholesale ? ' · mayorista' : ''}` : `Entre 1 y ${max}`}
      </p>
    </div>
  )
}

const dash = <span aria-label="sin precio mayorista">—</span>

/** PC: tabla densa (md y más). Celular: lista simple. Los precios mayoristas llegan en null si el servidor no los muestra. */
export function WholesaleTable({ rows }: { rows: WholesaleRow[] }) {
  return (
    <>
      <table data-testid="wholesale-table" className="hidden w-full border-collapse text-left text-sm md:table">
        <caption className="sr-only">Lista de productos con precios minoristas y mayoristas</caption>
        <thead>
          <tr className="border-b-2 border-blush-border bg-blush text-brand-ink">
            <th scope="col" className="px-3 py-2 font-semibold">Producto</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Stock</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Minorista</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Mayorista</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Mínimo</th>
            <th scope="col" className="px-3 py-2 font-semibold">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid="wholesale-row" className="border-b border-blush-border align-top">
              <th scope="row" className="px-3 py-2 text-base font-medium">{r.name}</th>
              <td className="px-3 py-2 text-right tabular-nums">{r.stock > 0 ? r.stock : 'Sin stock'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPrice(r.retailPrice)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-violet">
                {r.wholesalePrice != null ? formatPrice(r.wholesalePrice) : dash}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.wholesaleMinQty != null ? `${r.wholesaleMinQty} u.` : dash}
              </td>
              <td className="px-3 py-2">
                <QtyAdd row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul data-testid="wholesale-list" className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-blush-border bg-white p-3">
            <h3 className="text-base font-semibold">{r.name}</h3>
            <p className="text-base">
              Minorista {formatPrice(r.retailPrice)}
              {r.wholesalePrice != null && r.wholesaleMinQty != null && (
                <span className="block font-semibold text-violet">
                  Mayorista {formatPrice(r.wholesalePrice)} desde {r.wholesaleMinQty} u.
                </span>
              )}
            </p>
            <QtyAdd row={r} />
          </li>
        ))}
      </ul>
    </>
  )
}
