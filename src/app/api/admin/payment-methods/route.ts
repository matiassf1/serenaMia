import { z } from 'zod'
import { adminJson } from '@/lib/settingsApi'
import { deletePaymentMethod, savePaymentMethod, setPaymentMethodActive } from '@/lib/settings'

const Save = z.object({ id: z.number().int().optional(), name: z.string(), instructions: z.string() })
const Toggle = z.object({ id: z.number().int(), active: z.boolean() })
const Remove = z.object({ id: z.number().int() })

/** Crea (sin `id`) o edita (con `id`) un medio de pago. */
export const POST = (req: Request) =>
  adminJson(req, Save, async (b, admin) => ({ id: (await savePaymentMethod(b, admin.email)).id }))

export const PATCH = (req: Request) =>
  adminJson(req, Toggle, async (b, admin) => ({ active: (await setPaymentMethodActive(b.id, b.active, admin.email)).active }))

export const DELETE = (req: Request) => adminJson(req, Remove, (b, admin) => deletePaymentMethod(b.id, admin.email))
