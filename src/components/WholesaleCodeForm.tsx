'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PRICES_CHANGED_EVENT } from './CartProvider'

const MESSAGES: Record<number, string> = {
  401: 'Ese código no es correcto. Revisalo y probá de nuevo.',
  429: 'Probaste muchas veces. Esperá unos minutos y volvé a intentar.',
}

/**
 * Entrada de código mayorista. `banner`: botón chico "Tengo un código mayorista" que despliega el campo (sobre fondo violeta).
 * `page`: campo siempre visible (pantalla /mayoristas).
 */
export function WholesaleCodeForm({ variant }: { variant: 'banner' | 'page' }) {
  const router = useRouter()
  const inputId = useId()
  const [open, setOpen] = useState(variant === 'page')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const onBanner = variant === 'banner'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    if (!code.trim()) {
      setError('Escribí el código que te dio Serena Mia.')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/wholesale/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.ok) {
        window.dispatchEvent(new Event(PRICES_CHANGED_EVENT))
        router.refresh()
        return
      }
      setError(MESSAGES[res.status] ?? 'No pudimos verificar el código. Probá de nuevo en un rato.')
    } catch {
      setError('No pudimos conectarnos. Revisá tu internet y probá de nuevo.')
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-full px-3 text-sm font-semibold text-white underline underline-offset-2"
      >
        Tengo un código mayorista
      </button>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-md flex-col gap-2">
      <label htmlFor={inputId} className={`text-base font-semibold ${onBanner ? 'text-white' : 'text-foreground'}`}>
        Código mayorista
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-blush-border bg-white px-3 text-base text-foreground"
        />
        <button
          type="submit"
          disabled={sending}
          className={`min-h-11 rounded-full px-5 text-base font-semibold disabled:opacity-60 ${
            onBanner ? 'bg-white text-violet active:bg-blush' : 'bg-brand-deep text-white active:bg-brand-ink'
          }`}
        >
          {sending ? 'Verificando…' : 'Entrar'}
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className={`text-sm font-medium ${onBanner ? 'text-white' : 'text-red-800'}`}>
          {error}
        </p>
      )}
    </form>
  )
}
