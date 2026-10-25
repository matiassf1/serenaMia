'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const btn =
  'min-h-12 min-w-12 rounded-xl border border-[#7A4FA0]/40 bg-white px-3 text-base font-bold text-[#1A1218] active:bg-[#FDECF5] disabled:opacity-50'

export default function StockControls({ id, name, stock }: { id: number; name: string; stock: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(body: object) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? 'No se pudo guardar.')
      else router.refresh()
    } catch {
      setError('No se pudo conectar. Revisá tu conexión.')
    }
    setConfirming(false)
    setBusy(false)
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} disabled={busy || stock <= 0} aria-label={`Restar 1 a ${name}`} onClick={() => send({ delta: -1 })}>
          −1
        </button>
        <span className="min-w-10 text-center text-lg font-bold" aria-live="polite">
          {stock}
        </span>
        <button type="button" className={btn} disabled={busy} aria-label={`Sumar 1 a ${name}`} onClick={() => send({ delta: 1 })}>
          +1
        </button>
        {stock > 0 &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <button type="button" className="min-h-12 rounded-xl bg-[#C2398C] px-3 text-base font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => send({ soldOut: true })}>
                Sí, sin stock
              </button>
              <button type="button" className={btn} onClick={() => setConfirming(false)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" className={`${btn} ml-auto`} disabled={busy} aria-label={`Marcar sin stock ${name}`} onClick={() => setConfirming(true)}>
              Marcar sin stock
            </button>
          ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-[#FDECF5] px-3 py-2 text-sm font-medium text-[#8A1F60]">
          {error}
        </p>
      )}
    </div>
  )
}
