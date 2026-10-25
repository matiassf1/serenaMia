import { connection } from 'next/server'
import { db } from '@/lib/db'
import { getOpenStatus } from '@/lib/hours'
import { SiteNavClient } from './SiteNavClient'

export function SiteNavSkeleton() {
  return <div aria-hidden className="h-14 border-b border-blush-border bg-white/80 md:h-16" />
}

/** Barra de navegación fija: siempre hay un camino de vuelta al catálogo, en celular y en PC. */
export async function SiteNav() {
  await connection() // el punto verde/gris depende de la hora actual.
  const [settings, hours, exceptions] = await Promise.all([
    db.storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: { name: true } }),
    db.businessHours.findMany(),
    db.hoursException.findMany(),
  ])
  const status = getOpenStatus(new Date(), hours, exceptions)
  return <SiteNavClient name={settings.name} open={status.open} statusLabel={status.label} />
}
