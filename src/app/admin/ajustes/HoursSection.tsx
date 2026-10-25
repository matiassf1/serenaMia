'use client'

import { useState } from 'react'
import { Notice, card, danger, field, primary, secondary, useSave } from './ui'

export type Range = { opensAt: string; closesAt: string }
export type DayRanges = { weekday: number; label: string; ranges: Range[] }
export type ExceptionRow = { id: number; date: string; closed: boolean; opensAt: string | null; closesAt: string | null; note: string }

const timeField = 'mt-1 block min-h-12 w-full rounded-xl border border-[#7A4FA0]/40 bg-white px-3 text-base text-[#1A1218] focus:border-[#C2398C]'

/** "2026-10-28" → "28/10/2026" sin pasar por Date (evita corrimientos de zona horaria). */
const showDate = (iso: string) => iso.split('-').reverse().join('/')

export function WeeklyHours({ initial }: { initial: DayRanges[] }) {
  const [days, setDays] = useState(initial)
  const { busy, message, send, clear } = useSave()

  const update = (weekday: number, fn: (r: Range[]) => Range[]) => {
    clear()
    setDays(days.map((d) => (d.weekday === weekday ? { ...d, ranges: fn(d.ranges) } : d)))
  }

  return (
    <form
      className={`${card} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault()
        void send('/api/admin/hours', 'PUT', { days: days.map(({ weekday, ranges }) => ({ weekday, ranges })) }, 'Guardado: horarios de la semana.')
      }}
    >
      {days.map((d) => (
        <fieldset key={d.weekday} data-testid={`day-${d.weekday}`} className="space-y-2 border-b border-[#7A4FA0]/15 pb-4 last:border-b-0 last:pb-0">
          <legend className="text-lg font-bold">{d.label}</legend>
          {d.ranges.length === 0 && <p className="text-base text-[#4A3A52]">Cerrado todo el día</p>}
          {d.ranges.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <label className="min-w-0 flex-1 text-sm font-medium">
                Abre
                <input type="time" aria-label={`${d.label}: abre (tramo ${i + 1})`} className={timeField} value={r.opensAt} onChange={(e) => update(d.weekday, (rs) => rs.map((x, j) => (j === i ? { ...x, opensAt: e.target.value } : x)))} />
              </label>
              <label className="min-w-0 flex-1 text-sm font-medium">
                Cierra
                <input type="time" aria-label={`${d.label}: cierra (tramo ${i + 1})`} className={timeField} value={r.closesAt} onChange={(e) => update(d.weekday, (rs) => rs.map((x, j) => (j === i ? { ...x, closesAt: e.target.value } : x)))} />
              </label>
              <button type="button" className={`${secondary} shrink-0 px-3`} aria-label={`Quitar tramo ${i + 1} del ${d.label}`} onClick={() => update(d.weekday, (rs) => rs.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
          ))}
          <button type="button" className={secondary} aria-label={`Agregar tramo al ${d.label}`} onClick={() => update(d.weekday, (rs) => [...rs, rs.length === 0 ? { opensAt: '10:00', closesAt: '20:00' } : { opensAt: rs[rs.length - 1].closesAt, closesAt: '' }])}>
            + Agregar horario
          </button>
        </fieldset>
      ))}
      <button type="submit" className={`${primary} w-full`} disabled={busy}>
        Guardar horarios
      </button>
      <Notice message={message} />
    </form>
  )
}

export function Exceptions({ rows }: { rows: ExceptionRow[] }) {
  const { busy, message, send, clear } = useSave()
  const [date, setDate] = useState('')
  const [closed, setClosed] = useState(true)
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState<number | null>(null)

  async function add() {
    const body = { date, closed, note, ...(closed ? {} : { opensAt, closesAt }) }
    if (await send('/api/admin/hours', 'POST', body, 'Guardado: excepción agregada.')) {
      setDate('')
      setNote('')
      setOpensAt('')
      setClosesAt('')
      setClosed(true)
    }
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className={`${card} text-base`}>No hay excepciones cargadas.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} data-testid="exception-item" className={card}>
              <p className="text-lg font-bold">{showDate(r.date)}</p>
              <p className="text-base text-[#4A3A52]">
                {r.closed ? 'Cerrado todo el día' : `Abierto de ${r.opensAt} a ${r.closesAt}`}
                {r.note && ` · ${r.note}`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirm === r.id ? (
                  <>
                    <span className="text-base font-semibold">¿Borrar esta excepción?</span>
                    <button type="button" className={danger} disabled={busy} onClick={async () => { if (await send('/api/admin/hours', 'DELETE', { id: r.id }, 'Se borró la excepción.')) setConfirm(null) }}>
                      Sí, borrar
                    </button>
                    <button type="button" className={secondary} onClick={() => setConfirm(null)}>
                      No
                    </button>
                  </>
                ) : (
                  <button type="button" className={danger} aria-label={`Borrar excepción del ${showDate(r.date)}`} onClick={() => { clear(); setConfirm(r.id) }}>
                    Borrar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className={`${card} space-y-3`}
        aria-label="Agregar excepción"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <h3 className="text-lg font-bold">Agregar un feriado o cierre</h3>
        <div>
          <label htmlFor="ex-date" className="block text-sm font-medium">Fecha</label>
          <input id="ex-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Ese día</legend>
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input type="radio" name="ex-kind" className="size-5 accent-[#C2398C]" checked={closed} onChange={() => setClosed(true)} />
            Cerrado todo el día
          </label>
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input type="radio" name="ex-kind" className="size-5 accent-[#C2398C]" checked={!closed} onChange={() => setClosed(false)} />
            Abierto en un horario especial
          </label>
        </fieldset>
        {!closed && (
          <div className="flex gap-2">
            <label className="min-w-0 flex-1 text-sm font-medium">
              Abre
              <input type="time" className={timeField} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </label>
            <label className="min-w-0 flex-1 text-sm font-medium">
              Cierra
              <input type="time" className={timeField} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </label>
          </div>
        )}
        <div>
          <label htmlFor="ex-note" className="block text-sm font-medium">Motivo (se ve en el sitio)</label>
          <input id="ex-note" className={field} placeholder="Feriado" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="submit" className={`${primary} w-full`} disabled={busy}>
          Agregar excepción
        </button>
        <Notice message={message} />
      </form>
    </div>
  )
}
