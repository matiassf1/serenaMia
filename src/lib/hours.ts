import type { BusinessHours, HoursException } from '@prisma/client'

export type OpenStatus = { open: boolean; label: string }

export const STORE_TZ = 'America/Argentina/Tucuman'

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
type Interval = { opensAt: string; closesAt: string }

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Fecha y hora de pared en `tz`, sin depender de la zona del proceso. */
function localParts(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return { y: get('year'), m: get('month'), d: get('day'), minutes: get('hour') * 60 + get('minute') }
}

export function getOpenStatus(
  now: Date,
  schedule: BusinessHours[],
  exceptions: HoursException[],
  tz: string = STORE_TZ,
): OpenStatus {
  const { y, m, d, minutes } = localParts(now, tz)
  const base = Date.UTC(y, m - 1, d)

  const dayInfo = (offset: number): { intervals: Interval[]; note: string } => {
    const date = new Date(base + offset * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    const ex = exceptions.find((e) => e.date.toISOString().slice(0, 10) === key)
    if (ex) {
      const special = !ex.closed && ex.opensAt && ex.closesAt
      return { intervals: special ? [{ opensAt: ex.opensAt!, closesAt: ex.closesAt! }] : [], note: ex.note }
    }
    const intervals = schedule
      .filter((s) => s.weekday === date.getUTCDay())
      .sort((a, b) => toMinutes(a.opensAt) - toMinutes(b.opensAt))
    return { intervals, note: '' }
  }

  const today = dayInfo(0)
  const current = today.intervals.find((i) => toMinutes(i.opensAt) <= minutes && minutes < toMinutes(i.closesAt))
  if (current) return { open: true, label: `Abierto ahora · cierra a las ${current.closesAt}` }

  const prefix = today.note ? `Cerrado · ${today.note}` : 'Cerrado'
  const later = today.intervals.find((i) => toMinutes(i.opensAt) > minutes)
  if (later) return { open: false, label: `${prefix} · abre hoy a las ${later.opensAt}` }

  for (let offset = 1; offset <= 7; offset++) {
    const next = dayInfo(offset).intervals[0]
    if (!next) continue
    const when = offset === 1
      ? 'mañana'
      : `el ${DAY_NAMES[new Date(base + offset * 86_400_000).getUTCDay()]}`
    return { open: false, label: `${prefix} · abre ${when} a las ${next.opensAt}` }
  }
  return { open: false, label: prefix }
}
