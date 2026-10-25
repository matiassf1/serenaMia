import { describe, it, expect } from 'vitest'
import type { BusinessHours, HoursException } from '@prisma/client'
import { getOpenStatus } from '@/lib/hours'

const TZ = 'America/Argentina/Tucuman'
let id = 0
const bh = (weekday: number, opensAt: string, closesAt: string): BusinessHours => ({
  id: ++id, weekday, opensAt, closesAt,
})
const schedule: BusinessHours[] = [
  ...[1, 2, 3, 4, 5].map((d) => bh(d, '10:30', '20:00')),
  bh(6, '10:00', '14:00'),
]
// Tucumán es UTC−3 fijo: hora local + 3 = UTC. 2026-10-26 es lunes.
const at = (isoDate: string, hhmm: string) => new Date(`${isoDate}T${hhmm}:00-03:00`)
const MON = '2026-10-26'
const SAT = '2026-10-31'
const SUN = '2026-10-25'

describe('getOpenStatus', () => {
  it('lun 10:29 → cerrado, abre hoy a las 10:30', () => {
    expect(getOpenStatus(at(MON, '10:29'), schedule, [], TZ)).toEqual({
      open: false, label: 'Cerrado · abre hoy a las 10:30',
    })
  })
  it('lun 10:30 → abierto', () => {
    expect(getOpenStatus(at(MON, '10:30'), schedule, [], TZ)).toEqual({
      open: true, label: 'Abierto ahora · cierra a las 20:00',
    })
  })
  it('lun 19:59 → abierto', () => {
    expect(getOpenStatus(at(MON, '19:59'), schedule, [], TZ).open).toBe(true)
  })
  it('lun 20:00 → cerrado, abre mañana a las 10:30', () => {
    expect(getOpenStatus(at(MON, '20:00'), schedule, [], TZ)).toEqual({
      open: false, label: 'Cerrado · abre mañana a las 10:30',
    })
  })
  it('sáb 13:59 → abierto', () => {
    expect(getOpenStatus(at(SAT, '13:59'), schedule, [], TZ)).toEqual({
      open: true, label: 'Abierto ahora · cierra a las 14:00',
    })
  })
  it('sáb 14:00 → cerrado, abre el lunes a las 10:30', () => {
    expect(getOpenStatus(at(SAT, '14:00'), schedule, [], TZ)).toEqual({
      open: false, label: 'Cerrado · abre el lunes a las 10:30',
    })
  })
  it('domingo 12:00 → cerrado, abre mañana a las 10:30 (lunes)', () => {
    expect(getOpenStatus(at(SUN, '12:00'), schedule, [], TZ)).toEqual({
      open: false, label: 'Cerrado · abre mañana a las 10:30',
    })
  })
  it('viernes 20:00 → abre el sábado a las 10:00 (mañana)', () => {
    expect(getOpenStatus(at('2026-10-30', '20:00'), schedule, [], TZ).label).toBe(
      'Cerrado · abre mañana a las 10:00',
    )
  })
  it('excepción closed en día hábil → cerrado con nota', () => {
    const ex: HoursException[] = [
      { id: 1, date: new Date('2026-10-26T00:00:00Z'), closed: true, opensAt: null, closesAt: null, note: 'Feriado' },
    ]
    const s = getOpenStatus(at(MON, '12:00'), schedule, ex, TZ)
    expect(s.open).toBe(false)
    expect(s.label).toContain('Feriado')
    expect(s.label).toContain('abre mañana a las 10:30')
  })
  it('excepción con horario especial reemplaza el horario del día', () => {
    const ex: HoursException[] = [
      { id: 2, date: new Date('2026-10-26T00:00:00Z'), closed: false, opensAt: '12:00', closesAt: '16:00', note: 'Horario reducido' },
    ]
    expect(getOpenStatus(at(MON, '11:00'), schedule, ex, TZ).open).toBe(false)
    expect(getOpenStatus(at(MON, '15:59'), schedule, ex, TZ)).toEqual({
      open: true, label: 'Abierto ahora · cierra a las 16:00',
    })
  })
  it('varios tramos por día', () => {
    const split = [bh(1, '09:00', '13:00'), bh(1, '16:00', '20:00')]
    expect(getOpenStatus(at(MON, '14:00'), split, [], TZ).label).toBe('Cerrado · abre hoy a las 16:00')
    expect(getOpenStatus(at(MON, '16:00'), split, [], TZ).open).toBe(true)
  })
  it('sin horarios cargados → cerrado', () => {
    expect(getOpenStatus(at(MON, '12:00'), [], [], TZ).open).toBe(false)
  })
  it('el mismo instante da el mismo resultado con process.env.TZ distinto', () => {
    const instant = at(MON, '10:30')
    const original = process.env.TZ
    try {
      const results = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Auckland'].map((z) => {
        process.env.TZ = z
        return getOpenStatus(instant, schedule, [], TZ)
      })
      for (const r of results) expect(r).toEqual({ open: true, label: 'Abierto ahora · cierra a las 20:00' })
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})
