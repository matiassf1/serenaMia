import { z } from 'zod'
import { dbId } from '@/lib/bounds'
import { adminJson } from '@/lib/settingsApi'
import { deletePickupPoint, savePickupPoint, setPickupPointActive } from '@/lib/settings'

const Save = z.object({ id: dbId.optional(), name: z.string(), address: z.string() })
const Toggle = z.object({ id: dbId, active: z.boolean() })
const Remove = z.object({ id: dbId })

/** Crea (sin `id`) o edita (con `id`) un punto de retiro. */
export const POST = (req: Request) =>
  adminJson(req, Save, async (b, admin) => ({ id: (await savePickupPoint(b, admin.email)).id }))

export const PATCH = (req: Request) =>
  adminJson(req, Toggle, async (b, admin) => ({ active: (await setPickupPointActive(b.id, b.active, admin.email)).active }))

export const DELETE = (req: Request) => adminJson(req, Remove, (b, admin) => deletePickupPoint(b.id, admin.email))
