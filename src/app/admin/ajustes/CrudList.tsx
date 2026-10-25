'use client'

import { useState } from 'react'
import { Notice, card, danger, field, primary, secondary, useSave } from './ui'

export type CrudField = { key: string; label: string; help?: string; multiline?: boolean; inputMode?: 'text' | 'decimal' }
export type CrudItem = { id: number; name: string; active: boolean; summary: string; values: Record<string, string> }

type Props = {
  testId: string
  endpoint: string
  /** "medio de pago", "punto de retiro", "zona de envío" */
  noun: string
  /** "el" o "la" según el género de `noun`. */
  article: 'el' | 'la'
  fields: CrudField[]
  items: CrudItem[]
  emptyText: string
}

type Editing = { id?: number; values: Record<string, string> } | null

export default function CrudList({ testId, endpoint, noun, article, fields, items, emptyText }: Props) {
  const [editing, setEditing] = useState<Editing>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const { busy, message, send, clear } = useSave()
  const blank = Object.fromEntries(fields.map((f) => [f.key, '']))
  const a = article === 'el' ? 'un' : 'una'
  const o = article === 'el' ? 'o' : 'a'

  async function save() {
    if (!editing) return
    const body = { ...(editing.id !== undefined ? { id: editing.id } : {}), ...editing.values }
    const okText = `Guardado: ${noun} ${editing.id !== undefined ? 'actualizad' : 'agregad'}${o}.`
    if (await send(endpoint, 'POST', body, okText)) setEditing(null)
  }

  return (
    <div className="space-y-3" data-testid={testId}>
      {items.length === 0 && <p className={`${card} text-base`}>{emptyText}</p>}
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} data-testid={`${testId}-item`} className={card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-lg font-bold">{it.name}</h3>
                <p className="whitespace-pre-line break-words text-base text-[#4A3A52]">{it.summary}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${it.active ? 'bg-green-100 text-green-900' : 'bg-gray-200 text-gray-900'}`}
              >
                {it.active ? 'Activo' : 'Desactivado'}
              </span>
            </div>
            {editing?.id === it.id ? null : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={secondary} aria-label={`Editar ${it.name}`} onClick={() => { clear(); setConfirmDelete(null); setEditing({ id: it.id, values: it.values }) }}>
                  Editar
                </button>
                <button
                  type="button"
                  className={secondary}
                  disabled={busy}
                  aria-label={`${it.active ? 'Desactivar' : 'Activar'} ${it.name}`}
                  onClick={() => void send(endpoint, 'PATCH', { id: it.id, active: !it.active }, `Guardado: ${it.name} ${it.active ? 'desactivad' : 'activad'}${o}.`)}
                >
                  {it.active ? 'Desactivar' : 'Activar'}
                </button>
                {confirmDelete === it.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">¿Borrar {it.name}?</span>
                    <button type="button" className={danger} disabled={busy} onClick={async () => { if (await send(endpoint, 'DELETE', { id: it.id }, `Se borró ${it.name}.`)) setConfirmDelete(null) }}>
                      Sí, borrar
                    </button>
                    <button type="button" className={secondary} onClick={() => setConfirmDelete(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <button type="button" className={danger} aria-label={`Borrar ${it.name}`} onClick={() => { clear(); setEditing(null); setConfirmDelete(it.id) }}>
                    Borrar
                  </button>
                )}
              </div>
            )}
            {confirmDelete === it.id && (
              <p className="mt-2 text-sm text-[#4A3A52]">Si ya se usó en pedidos no se puede borrar: en ese caso desactivalo.</p>
            )}
            {editing?.id === it.id && renderForm()}
          </li>
        ))}
      </ul>

      {editing && editing.id === undefined ? (
        <div className={card}>
          <h3 className="text-lg font-bold">Nuev{o} {noun}</h3>
          {renderForm()}
        </div>
      ) : (
        <button type="button" className={`${secondary} w-full`} onClick={() => { clear(); setConfirmDelete(null); setEditing({ values: blank }) }}>
          + Agregar {a} {noun}
        </button>
      )}
      <Notice message={message} />
    </div>
  )

  function renderForm() {
    if (!editing) return null
    return (
      <div className="mt-3 space-y-3">
        {fields.map((f) => {
          const id = `${testId}-${editing.id ?? 'new'}-${f.key}`
          return (
            <div key={f.key}>
              <label htmlFor={id} className="block text-sm font-medium">
                {f.label}
              </label>
              {f.help && <p className="text-sm text-[#4A3A52]">{f.help}</p>}
              {f.multiline ? (
                <textarea id={id} rows={3} className={`${field} py-2`} value={editing.values[f.key]} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, [f.key]: e.target.value } })} />
              ) : (
                <input id={id} inputMode={f.inputMode} className={field} value={editing.values[f.key]} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, [f.key]: e.target.value } })} />
              )}
            </div>
          )
        })}
        <div className="flex gap-2">
          <button type="button" className={`${primary} flex-1`} disabled={busy} onClick={() => void save()}>
            Guardar
          </button>
          <button type="button" className={`${secondary} flex-1`} onClick={() => setEditing(null)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }
}
