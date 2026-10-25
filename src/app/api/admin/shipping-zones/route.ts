import { z } from 'zod'
import { adminJson } from '@/lib/settingsApi'
import { deleteShippingZone, saveShippingZone, setShippingZoneActive } from '@/lib/settings'

// `cost` viaja como texto tal como lo escribe Elías ("3.000,00"); el servidor lo convierte a centavos.
const Save = z.object({ id: z.number().int().optional(), name: z.string(), cost: z.string() })
const Toggle = z.object({ id: z.number().int(), active: z.boolean() })
const Remove = z.object({ id: z.number().int() })

/** Crea (sin `id`) o edita (con `id`) una zona de envío. */
export const POST = (req: Request) =>
  adminJson(req, Save, async (b, admin) => ({ id: (await saveShippingZone(b, admin.email)).id }))

export const PATCH = (req: Request) =>
  adminJson(req, Toggle, async (b, admin) => ({ active: (await setShippingZoneActive(b.id, b.active, admin.email)).active }))

export const DELETE = (req: Request) => adminJson(req, Remove, (b, admin) => deleteShippingZone(b.id, admin.email))
