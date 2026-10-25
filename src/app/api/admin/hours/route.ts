import { z } from 'zod'
import { adminJson } from '@/lib/settingsApi'
import { addHoursException, removeHoursException, replaceWeeklyHours } from '@/lib/settings'

const Week = z.object({
  days: z.array(
    z.object({
      weekday: z.number().int(),
      ranges: z.array(z.object({ opensAt: z.string(), closesAt: z.string() })),
    }),
  ),
})
const Exception = z.object({
  date: z.string(),
  closed: z.boolean(),
  opensAt: z.string().nullish(),
  closesAt: z.string().nullish(),
  note: z.string(),
})
const Remove = z.object({ id: z.number().int() })

/** Reemplaza el horario semanal completo. */
export const PUT = (req: Request) => adminJson(req, Week, async (b, admin) => void (await replaceWeeklyHours(b.days, admin.email)))

/** Agrega una excepción con fecha (feriado o cierre puntual). */
export const POST = (req: Request) => adminJson(req, Exception, async (b, admin) => ({ id: (await addHoursException(b, admin.email)).id }))

export const DELETE = (req: Request) => adminJson(req, Remove, (b, admin) => removeHoursException(b.id, admin.email))
