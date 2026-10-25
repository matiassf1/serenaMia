'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export const field =
  'mt-1 block min-h-12 w-full rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base text-[#1A1218] focus:border-[#C2398C]'
export const primary = 'min-h-12 rounded-xl bg-[#C2398C] px-5 text-base font-semibold text-white disabled:opacity-60'
export const secondary = 'min-h-12 rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base font-semibold text-[#7A4FA0] disabled:opacity-60'
export const danger = 'min-h-12 rounded-xl border border-red-700 bg-white px-4 text-base font-semibold text-red-800 disabled:opacity-60'
export const card = 'rounded-2xl border border-[#7A4FA0]/20 bg-white p-4'

type Message = { ok: boolean; text: string }

/** Llama a la API del admin; muestra un aviso visible de "Guardado" o el error en español. */
export function useSave() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  async function send(url: string, method: string, body: unknown, okText: string): Promise<boolean> {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? 'No se pudo guardar. Probá de nuevo.' })
        setBusy(false)
        return false
      }
      setMessage({ ok: true, text: okText })
      router.refresh()
      setBusy(false)
      return true
    } catch {
      setMessage({ ok: false, text: 'No se pudo conectar. Revisá tu conexión.' })
      setBusy(false)
      return false
    }
  }
  return { busy, message, send, clear: () => setMessage(null) }
}

export function Notice({ message }: { message: Message | null }) {
  if (!message) return null
  return (
    <p
      role={message.ok ? 'status' : 'alert'}
      className={`mt-3 rounded-xl px-3 py-2 text-base font-medium ${message.ok ? 'bg-green-100 text-green-900' : 'bg-[#FDECF5] text-[#8A1F60]'}`}
    >
      {message.ok ? '✓ ' : ''}
      {message.text}
    </p>
  )
}

export function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 space-y-3">
      <div>
        <h2 id={`${id}-title`} className="text-xl font-bold text-[#7A4FA0]">
          {title}
        </h2>
        {hint && <p className="text-sm text-[#4A3A52]">{hint}</p>}
      </div>
      {children}
    </section>
  )
}
