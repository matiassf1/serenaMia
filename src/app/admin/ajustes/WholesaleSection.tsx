'use client'

import { useState } from 'react'
import { Notice, card, field, primary, useSave } from './ui'

export type WholesaleValues = { wholesaleMode: 'PUBLIC' | 'CODE'; wholesaleCode: string; pendingExpiryHours: number }

const choice = 'flex min-h-12 items-start gap-3 rounded-xl border border-[#7A4FA0]/40 bg-white p-3 text-base'

export default function WholesaleSection({ initial }: { initial: WholesaleValues }) {
  const [mode, setMode] = useState(initial.wholesaleMode)
  const [code, setCode] = useState(initial.wholesaleCode)
  const [hours, setHours] = useState(String(initial.pendingExpiryHours))
  const { busy, message, send } = useSave()

  return (
    <form
      className={`${card} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault()
        void send(
          '/api/admin/settings',
          'PUT',
          { section: 'wholesale', wholesaleMode: mode, wholesaleCode: code, pendingExpiryHours: hours.trim() === '' ? NaN : Number(hours) },
          'Guardado: mayorista y plazo de pago.',
        )
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-base font-bold">¿Quién ve los precios mayoristas?</legend>
        <label className={choice}>
          <input type="radio" name="wmode" className="mt-1 size-5 accent-[#C2398C]" checked={mode === 'PUBLIC'} onChange={() => setMode('PUBLIC')} />
          <span>
            <strong>Todos</strong>
            <br />
            <span className="text-sm text-[#4A3A52]">El precio por cantidad se aplica solo, sin pedir nada.</span>
          </span>
        </label>
        <label className={choice}>
          <input type="radio" name="wmode" className="mt-1 size-5 accent-[#C2398C]" checked={mode === 'CODE'} onChange={() => setMode('CODE')} />
          <span>
            <strong>Solo con código</strong>
            <br />
            <span className="text-sm text-[#4A3A52]">Los salones ven el precio mayorista después de escribir el código que vos les des.</span>
          </span>
        </label>
      </fieldset>

      {mode === 'CODE' && (
        <div>
          <label htmlFor="wcode" className="block text-sm font-medium">
            Código mayorista
          </label>
          <p className="text-sm text-[#4A3A52]">Si lo cambiás, el código anterior deja de funcionar.</p>
          <input id="wcode" className={field} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        </div>
      )}

      <div>
        <label htmlFor="expiry" className="block text-sm font-medium">
          Horas para pagar un pedido
        </label>
        <p className="text-sm text-[#4A3A52]">Si no se paga en este tiempo, el pedido se cancela solo y el stock vuelve.</p>
        <input id="expiry" className={field} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
      </div>

      <button type="submit" className={`${primary} w-full`} disabled={busy}>
        Guardar mayorista
      </button>
      <Notice message={message} />
    </form>
  )
}
