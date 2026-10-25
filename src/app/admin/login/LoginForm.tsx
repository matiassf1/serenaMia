'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

const field =
  'mt-1 block min-h-12 w-full rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base text-[#1A1218] focus:border-[#C2398C] focus:outline-2 focus:outline-offset-2 focus:outline-[#C2398C]'

export default function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      if (res.ok) {
        router.replace('/admin')
        router.refresh()
        return
      }
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'No se pudo ingresar. Probá de nuevo.')
    } catch {
      setError('No se pudo conectar. Revisá tu conexión.')
    }
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-medium text-[#1A1218]">
        Email
        <input name="email" type="email" autoComplete="username" required className={field} />
      </label>
      <label className="block text-sm font-medium text-[#1A1218]">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-[#FDECF5] px-4 py-3 text-sm font-medium text-[#8A1F60]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-[#C2398C] px-4 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  )
}
