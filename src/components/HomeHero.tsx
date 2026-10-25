import Image from 'next/image'
import { connection } from 'next/server'
import { db } from '@/lib/db'
import { getOpenStatus } from '@/lib/hours'
import { mapsHref } from '@/lib/maps'
import { scheduleGroups, todayWeekday } from '@/lib/schedule'
import { whatsappDigits } from '@/lib/whatsapp'
import { ArrowRightIcon, ClockIcon, PinIcon, SparkleIcon, WhatsappIcon } from './icons'

export function HomeHeroSkeleton() {
  return <div aria-hidden className="h-[34rem] bg-blush lg:h-[30rem]" />
}

const SPARKLES = [
  { cls: 'left-[6%] top-[14%] size-5 text-brand', delay: '0s' },
  { cls: 'left-[44%] top-[8%] size-3 text-violet', delay: '1.2s' },
  { cls: 'right-[8%] top-[20%] size-6 text-brand', delay: '2.1s' },
  { cls: 'bottom-[12%] left-[38%] size-4 text-violet', delay: '0.7s' },
  { cls: 'bottom-[18%] right-[4%] size-3 text-brand', delay: '3s' },
] as const

/** Portada: lo primero que se ve es el local (nombre, dirección, horarios, estado), como pidió Elías. */
export async function HomeHero() {
  await connection() // "Abierto ahora" depende de la hora: nunca se prerenderiza.
  const [settings, hours, exceptions] = await Promise.all([
    db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
    db.businessHours.findMany(),
    db.hoursException.findMany(),
  ])
  const now = new Date()
  const status = getOpenStatus(now, hours, exceptions)
  const today = todayWeekday(now)
  const groups = scheduleGroups(hours)
  const waDigits = whatsappDigits(settings.whatsapp)

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-blush via-white to-white">
      {/* Fondo vivo: manchas de color que se desplazan lento (solo CSS, respeta "reducir movimiento"). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-drift absolute -left-24 -top-32 size-[28rem] rounded-full bg-brand/25 blur-3xl" />
        <div className="animate-drift-slow absolute -right-20 top-10 size-[26rem] rounded-full bg-violet/20 blur-3xl" />
        <div className="animate-drift absolute bottom-[-8rem] left-1/3 size-[22rem] rounded-full bg-brand-deep/15 blur-3xl" />
        {SPARKLES.map((s, i) => (
          <SparkleIcon key={i} className={`animate-sparkle absolute ${s.cls}`} style={{ animationDelay: s.delay }} />
        ))}
      </div>

      <div className="mx-auto grid max-w-7xl gap-x-12 gap-y-6 px-4 pb-8 pt-6 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-14 lg:pt-10">
        <div className="animate-fade-up flex items-center gap-4 lg:col-start-1 lg:row-start-1 lg:gap-6">
          <div className="animate-float relative shrink-0">
            <div aria-hidden className="absolute inset-0 -z-10 rounded-full bg-brand/40 blur-2xl" />
            <Image
              src="/logo.png"
              alt=""
              width={160}
              height={160}
              priority
              className="size-[72px] rounded-full shadow-lg ring-4 ring-white lg:size-32"
            />
          </div>
          <div className="min-w-0">
            <h1 className="font-script bg-gradient-to-r from-brand-ink via-brand-deep to-violet bg-clip-text text-5xl font-bold leading-[1.05] text-transparent lg:text-7xl">
              {settings.name}
            </h1>
            <p className="mt-1 text-lg font-semibold text-violet lg:mt-3 lg:text-2xl">{settings.tagline}</p>
          </div>
        </div>

        <p className="animate-fade-up hidden max-w-xl text-lg text-muted [animation-delay:120ms] lg:col-start-1 lg:row-start-2 lg:block">
          Insumos y cosmetología para salones y clientas. Elegí, pedí online y retirá en el local o recibilo, sin vueltas.
        </p>

        <div className="animate-fade-up rounded-3xl border border-white/70 bg-white/70 p-5 shadow-xl shadow-brand/10 backdrop-blur-xl [animation-delay:100ms] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:p-8">
          <p
            role="status"
            className={`flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
              status.open ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            <span className={`inline-block size-2.5 rounded-full ${status.open ? 'animate-pulse-dot bg-green-500' : 'bg-gray-400'}`} />
            {status.label}
          </p>

          <div className="mt-4 flex gap-3">
            <PinIcon className="mt-0.5 size-6 shrink-0 text-brand-deep" />
            <p className="text-base font-medium lg:text-lg">{settings.address}</p>
          </div>

          <div className="mt-4 flex gap-3">
            <ClockIcon className="mt-0.5 size-6 shrink-0 text-brand-deep" />
            <ul className="w-full text-base lg:text-lg">
              {groups.map((g) => {
                const isToday = g.days.includes(today)
                return (
                  <li
                    key={g.label}
                    className={`flex items-center justify-between gap-4 rounded-xl px-3 py-1.5 ${
                      isToday ? 'bg-brand-deep/10 font-semibold text-brand-ink' : g.closed ? 'text-muted' : ''
                    }`}
                  >
                    <span>
                      {g.label}
                      {isToday && (
                        <span className="ml-2 rounded-full bg-brand-deep px-2 py-0.5 align-middle text-xs font-bold text-white">Hoy</span>
                      )}
                    </span>
                    <span className="tabular-nums">{g.slot}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <div className="animate-fade-up grid grid-cols-2 gap-3 [animation-delay:160ms] lg:col-start-1 lg:row-start-3 lg:flex lg:flex-wrap lg:gap-4">
          <a
            href={mapsHref(settings.mapsUrl, settings.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-deep px-6 text-base font-semibold text-white shadow-lg shadow-brand/30 transition hover:-translate-y-0.5 hover:bg-brand-ink active:translate-y-0 lg:min-h-14 lg:px-8 lg:text-lg"
          >
            Cómo llegar
            <ArrowRightIcon className="hidden size-5 transition-transform group-hover:translate-x-1 lg:block" />
          </a>
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-brand-deep bg-white/80 px-6 text-base font-semibold text-brand-ink backdrop-blur transition hover:-translate-y-0.5 hover:bg-white active:translate-y-0 lg:min-h-14 lg:px-8 lg:text-lg"
          >
            <WhatsappIcon className="hidden size-5 lg:block" />
            WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}
