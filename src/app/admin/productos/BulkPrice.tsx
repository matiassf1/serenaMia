'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatARS } from '@/lib/money'

type Row = { id: number; name: string; retailBefore: number; retailAfter: number }
type Category = { id: number; name: string }

const field =
  'mt-1 block min-h-12 w-full rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base text-[#1A1218] focus:border-[#C2398C]'
const primary = 'min-h-12 w-full rounded-xl bg-[#C2398C] px-4 text-base font-semibold text-white disabled:opacity-60'
const secondary = 'min-h-12 w-full rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base font-semibold text-[#7A4FA0]'

export default function BulkPrice({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [percent, setPercent] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const parsedPercent = Number(percent.replace(',', '.'))

  async function call(apply: boolean) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/products/bulk-price', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoryId: category === '' ? null : Number(category), percent: parsedPercent, apply }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? 'No se pudo calcular.' })
      } else if (apply) {
        setRows(null)
        setPercent('')
        setMessage({ ok: true, text: `Listo: se cambió el precio de ${data.updated} producto${data.updated === 1 ? '' : 's'}.` })
        router.refresh()
      } else {
        setRows(data.rows)
        if (data.rows.length === 0) setMessage({ ok: false, text: 'No hay productos en esa categoría.' })
      }
    } catch {
      setMessage({ ok: false, text: 'No se pudo conectar. Revisá tu conexión.' })
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button type="button" className={secondary} onClick={() => setOpen(true)}>
        Cambiar precios por porcentaje
      </button>
    )
  }

  return (
    <section aria-label="Cambiar precios por porcentaje" className="rounded-2xl border border-[#7A4FA0]/30 bg-white p-4">
      <h2 className="text-lg font-bold text-[#7A4FA0]">Cambiar precios por porcentaje</h2>
      <p className="mt-1 text-sm text-[#4A3A52]">Primero vas a ver cómo quedan los precios. Recién después se aplican.</p>
      <div className="mt-3 space-y-3">
        <label className="block text-sm font-medium">
          Categoría
          <select className={field} value={category} onChange={(e) => { setCategory(e.target.value); setRows(null) }}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Porcentaje (ej. 10 para subir, -5 para bajar)
          <input
            className={field}
            inputMode="decimal"
            value={percent}
            onChange={(e) => { setPercent(e.target.value); setRows(null) }}
            placeholder="10"
          />
        </label>
        <button type="button" className={primary} disabled={busy || percent.trim() === '' || !Number.isFinite(parsedPercent)} onClick={() => call(false)}>
          Ver cómo quedan
        </button>
      </div>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-3 rounded-xl px-3 py-2 text-sm font-medium ${message.ok ? 'bg-green-100 text-green-900' : 'bg-[#FDECF5] text-[#8A1F60]'}`}>
          {message.text}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-4" data-testid="bulk-preview">
          <h3 className="font-bold">Vista previa: {rows.length} producto{rows.length === 1 ? '' : 's'}</h3>
          <ul className="mt-2 max-h-72 divide-y divide-[#7A4FA0]/15 overflow-y-auto rounded-xl border border-[#7A4FA0]/20">
            {rows.map((r) => (
              <li key={r.id} className="px-3 py-2 text-sm">
                <p className="font-semibold">{r.name}</p>
                <p>
                  {formatARS(r.retailBefore)} → <strong>{formatARS(r.retailAfter)}</strong>
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2">
            <button type="button" className={primary} disabled={busy} onClick={() => call(true)}>
              Aplicar a {rows.length} producto{rows.length === 1 ? '' : 's'}
            </button>
            <button type="button" className={secondary} onClick={() => setRows(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <button type="button" className="mt-3 min-h-12 w-full text-base font-semibold text-[#7A4FA0] underline" onClick={() => { setOpen(false); setRows(null); setMessage(null) }}>
        Cerrar
      </button>
    </section>
  )
}
