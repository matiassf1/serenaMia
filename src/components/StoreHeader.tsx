import Image from 'next/image'
import { connection } from 'next/server'
import type { BusinessHours } from '@prisma/client'
import { db } from '@/lib/db'
import { getOpenStatus } from '@/lib/hours'
import { whatsappDigits } from '@/lib/whatsapp'

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** "Lun–Vie 10:30–20:00 · Sáb 10:00–14:00": agrupa días consecutivos con el mismo horario. */
export function formatSchedule(rows: BusinessHours[]): string {
  const byDay = new Map<number, string>()
  for (const r of [...rows].sort((a, b) => a.opensAt.localeCompare(b.opensAt))) {
    const slot = `${r.opensAt}–${r.closesAt}`
    byDay.set(r.weekday, byDay.has(r.weekday) ? `${byDay.get(r.weekday)} y ${slot}` : slot)
  }
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => byDay.has(d))
  const groups: { days: number[]; slot: string }[] = []
  for (const d of order) {
    const last = groups[groups.length - 1]
    const prev = last?.days[last.days.length - 1]
    if (last && last.slot === byDay.get(d) && prev !== undefined && (prev + 1) % 7 === d) last.days.push(d)
    else groups.push({ days: [d], slot: byDay.get(d)! })
  }
  return groups
    .map((g) => {
      const first = DAY_SHORT[g.days[0]]
      const last = DAY_SHORT[g.days[g.days.length - 1]]
      return `${g.days.length > 1 ? `${first}–${last}` : first} ${g.slot}`
    })
    .join(' · ')
}

export function StoreHeaderSkeleton() {
  return <div aria-hidden className="h-[22rem] bg-blush" />
}

export async function StoreHeader() {
  await connection() // "Abierto ahora" depende de la hora: nunca se prerenderiza.
  const [settings, hours, exceptions] = await Promise.all([
    db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
    db.businessHours.findMany(),
    db.hoursException.findMany(),
  ])
  const status = getOpenStatus(new Date(), hours, exceptions)
  const waDigits = whatsappDigits(settings.whatsapp)

  return (
    <header className="border-b border-blush-border bg-gradient-to-b from-blush to-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-5 pt-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt=""
            width={88}
            height={88}
            priority
            className="size-[88px] shrink-0 rounded-full shadow-sm ring-2 ring-blush-border"
          />
          <div className="min-w-0">
            <h1 className="font-script text-[2.5rem] font-bold leading-none text-brand-ink">{settings.name}</h1>
            <p className="mt-1 text-base font-medium text-violet">{settings.tagline}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-1">
          <ul className="flex flex-col gap-1.5 text-base">
            <li className="flex gap-2">
              <span aria-hidden>📍</span>
              <span>{settings.address}</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>🕒</span>
              <span>{formatSchedule(hours)}</span>
            </li>
          </ul>
          <p
            role="status"
            className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
              status.open ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {status.label}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center rounded-full bg-brand-deep px-4 text-base font-semibold text-white active:bg-brand-ink"
            >
              Cómo llegar
            </a>
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center rounded-full border-2 border-brand-deep bg-white px-4 text-base font-semibold text-brand-ink active:bg-blush"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </div>
      {settings.wholesaleBanner && (
        <p className="bg-violet px-4 py-2.5 text-center text-sm font-medium text-white">{settings.wholesaleBanner}</p>
      )}
    </header>
  )
}
