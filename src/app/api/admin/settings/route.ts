import { z } from 'zod'
import { adminJson } from '@/lib/settingsApi'
import { updateStoreSettings, updateWholesaleSettings } from '@/lib/settings'

const Body = z.discriminatedUnion('section', [
  z.object({
    section: z.literal('store'),
    name: z.string(),
    tagline: z.string(),
    address: z.string(),
    whatsapp: z.string(),
    instagram: z.string(),
    mapsUrl: z.string(),
    wholesaleBanner: z.string(),
  }),
  z.object({
    section: z.literal('wholesale'),
    wholesaleMode: z.enum(['PUBLIC', 'CODE']),
    wholesaleCode: z.string().nullable(),
    pendingExpiryHours: z.number(),
  }),
])

/** Un guardado por sección: datos del local (con aviso mayorista) o reglas mayoristas. */
export const PUT = (req: Request) =>
  adminJson(req, Body, async (b, admin) => {
    if (b.section === 'store') await updateStoreSettings(b, admin.email)
    else await updateWholesaleSettings(b, admin.email)
  })
