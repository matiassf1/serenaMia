'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const btn =
  'flex min-h-12 w-full items-center justify-center rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base font-semibold text-[#4B2A6B] active:bg-[#FDECF5] disabled:opacity-50'
const primary =
  'flex min-h-12 w-full items-center justify-center rounded-xl bg-[#C2398C] px-4 text-base font-semibold text-white active:bg-[#A92E78] disabled:opacity-60'

type Props = {
  id: number
  status: string
  paid: boolean
  cancelled: boolean
  next: { value: string; label: string } | null
  canExtend: boolean
}

export default function OrderActions({ id, paid, cancelled, next, canExtend }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(body: object, ok?: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? 'No se pudo guardar.')
      else {
        if (ok) setMessage(ok)
        router.refresh()
      }
    } catch {
      setError('No se pudo conectar. Revisá tu conexión.')
    }
    setConfirming(false)
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      {!cancelled && next && (
        <button type="button" className={primary} disabled={busy} onClick={() => send({ action: 'status', status: next.value })}>
          {next.label}
        </button>
      )}
      {!cancelled && !paid && (
        <button type="button" className={btn} disabled={busy} onClick={() => send({ action: 'paid' })}>
          Marcar pagado
        </button>
      )}
      {canExtend && (
        <button type="button" className={btn} disabled={busy} onClick={() => send({ action: 'extend', hours: 24 }, 'Plazo de pago extendido 24 horas.')}>
          Extender plazo de pago (24 h)
        </button>
      )}
      {!cancelled &&
        (confirming ? (
          <div role="alertdialog" aria-label="Confirmar cancelación" className="space-y-2 rounded-xl border border-[#C2398C] bg-[#FDECF5] p-3">
            <p className="text-base font-semibold text-[#8A1F60]">¿Cancelar el pedido? Se devuelve el stock y no se puede deshacer.</p>
            <div className="flex gap-2">
              <button type="button" className={primary} disabled={busy} onClick={() => send({ action: 'cancel' })}>
                Sí, cancelar pedido
              </button>
              <button type="button" className={btn} disabled={busy} onClick={() => setConfirming(false)}>
                No, volver
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={btn} disabled={busy} onClick={() => setConfirming(true)}>
            Cancelar pedido
          </button>
        ))}
      {message && (
        <p role="status" className="rounded-xl bg-green-100 px-3 py-2 text-sm font-medium text-green-900">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-[#FDECF5] px-3 py-2 text-sm font-medium text-[#8A1F60]">
          {error}
        </p>
      )}
    </div>
  )
}
