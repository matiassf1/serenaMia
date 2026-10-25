'use client'

import { useState, type FormEvent } from 'react'
import { formatPrice } from '@/lib/money'
import type { OrderView } from '@/lib/orders'

type View = Omit<OrderView, 'createdAt'> & { createdAt: string }

const STEPS = [
  { status: 'RECEIVED', label: 'Recibido', hint: 'Recibimos tu pedido.' },
  { status: 'PREPARING', label: 'Preparando', hint: 'Lo estamos armando.' },
  { status: 'READY', label: 'Listo', hint: 'Ya está listo para vos.' },
  { status: 'DELIVERED', label: 'Entregado', hint: 'Ya lo recibiste.' },
] as const

const NOT_FOUND = 'No encontramos ese pedido. Revisá el número y el teléfono e intentá de nuevo.'
const input = 'min-h-12 w-full rounded-xl border-2 border-gray-400 bg-white px-3 text-base'

export function TrackingForm() {
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<View | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOrder(null)
    // Se normaliza acá y también en el servidor: minúsculas y espacios de más no deben fallar.
    const cleanCode = code.replace(/\s+/g, '').toUpperCase()
    if (!cleanCode || !phone.trim()) {
      setError('Completá el número de pedido y tu teléfono.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, phone }),
      })
      if (res.ok) setOrder(await res.json())
      else if (res.status === 429) setError('Probaste muchas veces. Esperá unos minutos e intentá de nuevo.')
      else if (res.status === 404) setError(NOT_FOUND)
      else setError('Algo salió mal. Intentá de nuevo en un momento.')
    } catch {
      setError('No pudimos conectarnos. Revisá tu internet e intentá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-base font-semibold">Número de pedido</label>
          <input
            id="code"
            className={`${input} uppercase placeholder:normal-case`}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="SM-7K2Q9X"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-base font-semibold">Tu teléfono</label>
          <input
            id="phone"
            className={input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="381 611-6380"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-base font-medium text-red-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="min-h-14 rounded-full bg-brand-deep px-6 text-lg font-bold text-white active:bg-brand-ink disabled:opacity-70"
        >
          {busy ? 'Buscando…' : 'Ver mi pedido'}
        </button>
      </form>

      {order && <OrderStatusCard order={order} />}
    </>
  )
}

function OrderStatusCard({ order }: { order: View }) {
  const current = STEPS.findIndex((s) => s.status === order.status)
  const cancelled = order.status === 'CANCELLED'
  const date = new Date(order.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Tucuman' })

  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-2xl border border-blush-border p-4">
      <div className="text-center">
        <p className="text-base text-muted">Pedido del {date}</p>
        <h3 className="text-3xl font-bold text-brand-ink">{order.code}</h3>
      </div>

      {cancelled ? (
        <div className="rounded-xl border-2 border-red-800 bg-red-50 p-4 text-center">
          <p className="text-xl font-bold text-red-800">Pedido cancelado</p>
          <p className="mt-1 text-base">Este pedido ya no sigue en curso. Si tenés dudas, escribinos por WhatsApp.</p>
        </div>
      ) : (
        <ol data-testid="timeline" className="flex flex-col gap-2">
          {STEPS.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'todo'
            return (
              <li
                key={s.status}
                aria-current={state === 'current' ? 'step' : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 py-2 ${
                  state === 'current'
                    ? 'border-brand-deep bg-blush'
                    : state === 'done'
                      ? 'border-blush-border bg-white'
                      : 'border-gray-200 bg-white text-muted'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    state === 'todo' ? 'border-2 border-gray-300 text-muted' : 'bg-brand-deep text-white'
                  }`}
                >
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span className="flex flex-col">
                  <span className={`text-lg ${state === 'current' ? 'font-bold text-brand-ink' : 'font-semibold'}`}>{s.label}</span>
                  {state === 'current' && <span className="text-base">{s.hint}</span>}
                </span>
                {state === 'done' && <span className="sr-only">(listo)</span>}
              </li>
            )
          })}
        </ol>
      )}

      <p className="text-base font-semibold">
        {order.paymentStatus === 'PAID' ? 'Pago recibido' : 'Pago pendiente'}
        <span className="font-normal text-muted"> · {order.deliveryType === 'PICKUP' ? 'Retiro en el local' : 'Envío a domicilio'}</span>
      </p>

      <ul className="flex flex-col gap-1 border-t border-blush-border pt-3 text-base">
        {order.items.map((i, idx) => (
          <li key={idx} className="flex justify-between gap-3">
            <span>
              {i.quantity} × {i.productName}
            </span>
            <span className="shrink-0">{formatPrice(i.unitPrice * i.quantity)}</span>
          </li>
        ))}
        {order.shippingCost > 0 && (
          <li className="flex justify-between gap-3">
            <span>Envío</span>
            <span>{formatPrice(order.shippingCost)}</span>
          </li>
        )}
      </ul>
      <p className="flex justify-between border-t border-blush-border pt-2 text-lg font-bold">
        <span>Total</span>
        <span>{formatPrice(order.total)}</span>
      </p>
    </section>
  )
}
