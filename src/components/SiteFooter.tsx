import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'
import { db } from '@/lib/db'
import { mapsHref } from '@/lib/maps'
import { scheduleGroups } from '@/lib/schedule'
import { whatsappDigits } from '@/lib/whatsapp'
import { InstagramIcon, PinIcon, WhatsappIcon } from './icons'

export function SiteFooterSkeleton() {
  return <div aria-hidden className="h-48 bg-blush" />
}

export async function SiteFooter() {
  await connection() // datos editables en el panel: nunca se congelan en el build.
  const [settings, hours] = await Promise.all([db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }), db.businessHours.findMany()])
  const groups = scheduleGroups(hours)
  return (
    <footer className="mt-12 border-t border-blush-border bg-blush pb-20 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3 md:px-8">
        <div className="flex items-start gap-4">
          <Image src="/logo.png" alt="" width={56} height={56} className="size-14 rounded-full ring-2 ring-white" />
          <div>
            <p className="font-script text-3xl font-bold leading-none text-brand-ink">{settings.name}</p>
            <p className="mt-1 text-base font-medium text-violet">{settings.tagline}</p>
          </div>
        </div>
        <div className="text-base">
          <p className="font-semibold text-brand-ink">Visitanos</p>
          <p className="mt-2 flex gap-2">
            <PinIcon className="mt-0.5 size-5 shrink-0 text-brand-deep" />
            <span>{settings.address}</span>
          </p>
          <ul className="mt-2 text-muted">
            {groups.map((g) => (
              <li key={g.label}>
                {g.label}: {g.slot}
              </li>
            ))}
          </ul>
        </div>
        <ul className="flex flex-col gap-1 text-base font-semibold text-brand-ink">
          <li>
            <a href={`https://wa.me/${whatsappDigits(settings.whatsapp)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 hover:underline">
              <WhatsappIcon className="size-5" /> Escribinos por WhatsApp
            </a>
          </li>
          {settings.instagram && (
            <li>
              <a href={settings.instagram} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 hover:underline">
                <InstagramIcon className="size-5" /> Instagram
              </a>
            </li>
          )}
          <li>
            <a href={mapsHref(settings.mapsUrl, settings.address)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 hover:underline">
              <PinIcon className="size-5" /> Cómo llegar
            </a>
          </li>
          <li>
            <Link href="/seguimiento" className="flex min-h-11 items-center gap-2 hover:underline">
              Seguí tu pedido
            </Link>
          </li>
        </ul>
      </div>
      <p className="border-t border-blush-border px-4 py-4 text-center text-sm text-muted">
        © {settings.name} · San Miguel de Tucumán
      </p>
    </footer>
  )
}
