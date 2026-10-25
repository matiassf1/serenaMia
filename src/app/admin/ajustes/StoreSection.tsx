'use client'

import { useState } from 'react'
import { Notice, card, field, primary, useSave } from './ui'

export type StoreValues = {
  name: string
  tagline: string
  address: string
  whatsapp: string
  instagram: string
  mapsUrl: string
  wholesaleBanner: string
}

const FIELDS: { key: keyof StoreValues; label: string; help?: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Nombre del local' },
  { key: 'tagline', label: 'Frase debajo del nombre' },
  { key: 'address', label: 'Dirección' },
  { key: 'whatsapp', label: 'WhatsApp', help: 'Con código de país. Ejemplo: +54 9 381 611-6380' },
  { key: 'instagram', label: 'Instagram', help: 'Ejemplo: @serenamiaest' },
  { key: 'mapsUrl', label: 'Link de Google Maps', help: 'Es el botón "Cómo llegar". Tiene que empezar con https://' },
  { key: 'wholesaleBanner', label: 'Aviso mayorista', help: 'Se ve arriba de todo en el sitio. Dejalo vacío para ocultarlo.', multiline: true },
]

export default function StoreSection({ initial }: { initial: StoreValues }) {
  const [values, setValues] = useState(initial)
  const { busy, message, send } = useSave()

  return (
    <form
      className={`${card} space-y-3`}
      onSubmit={(e) => {
        e.preventDefault()
        void send('/api/admin/settings', 'PUT', { section: 'store', ...values }, 'Guardado: datos del local.')
      }}
    >
      {FIELDS.map((f) => {
        const id = `store-${f.key}`
        return (
          <div key={f.key}>
            <label htmlFor={id} className="block text-sm font-medium">
              {f.label}
            </label>
            {f.help && <p className="text-sm text-[#4A3A52]">{f.help}</p>}
            {f.multiline ? (
              <textarea id={id} rows={3} className={`${field} py-2`} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            ) : (
              <input id={id} className={field} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </div>
        )
      })}
      <button type="submit" className={`${primary} w-full`} disabled={busy}>
        Guardar datos del local
      </button>
      <Notice message={message} />
    </form>
  )
}
