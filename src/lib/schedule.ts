import type { BusinessHours } from '@prisma/client'

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const TZ = 'America/Argentina/Tucuman'

export type ScheduleGroup = { days: number[]; label: string; slot: string; closed: boolean }

/** Agrupa días consecutivos con el mismo horario ("Lun–Vie 10:30–20:00") e incluye los días cerrados ("Dom Cerrado"). */
export function scheduleGroups(rows: BusinessHours[]): ScheduleGroup[] {
  const byDay = new Map<number, string>()
  for (const r of [...rows].sort((a, b) => a.opensAt.localeCompare(b.opensAt))) {
    const slot = `${r.opensAt}–${r.closesAt}`
    byDay.set(r.weekday, byDay.has(r.weekday) ? `${byDay.get(r.weekday)} y ${slot}` : slot)
  }
  const groups: ScheduleGroup[] = []
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const slot = byDay.get(d) ?? 'Cerrado'
    const last = groups[groups.length - 1]
    const prev = last?.days[last.days.length - 1]
    if (last && last.slot === slot && prev !== undefined && (prev + 1) % 7 === d) last.days.push(d)
    else groups.push({ days: [d], label: '', slot, closed: !byDay.has(d) })
  }
  for (const g of groups) {
    const first = DAY_SHORT[g.days[0]]
    const last = DAY_SHORT[g.days[g.days.length - 1]]
    g.label = g.days.length > 1 ? `${first}–${last}` : first
  }
  return groups
}

/** Día de la semana (0 = domingo) hoy en Tucumán, sin depender de la zona del servidor ni del visitante. */
export function todayWeekday(now: Date = new Date()): number {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ }).format(now)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short)
}
