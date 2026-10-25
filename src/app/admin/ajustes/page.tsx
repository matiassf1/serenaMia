import type { Metadata } from 'next'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatARS } from '@/lib/money'
import CrudList, { type CrudItem } from './CrudList'
import { Exceptions, WeeklyHours, type DayRanges } from './HoursSection'
import StoreSection from './StoreSection'
import { Section } from './ui'
import WholesaleSection from './WholesaleSection'

export const metadata: Metadata = { title: 'Ajustes · Serena Mia Admin' }

const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'Lunes' },
  { weekday: 2, label: 'Martes' },
  { weekday: 3, label: 'Miércoles' },
  { weekday: 4, label: 'Jueves' },
  { weekday: 5, label: 'Viernes' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
]
const LINKS = [
  ['local', 'Local'],
  ['horarios', 'Horarios'],
  ['pagos', 'Pagos'],
  ['entregas', 'Entregas'],
  ['mayorista', 'Mayorista'],
]

const costText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

async function Settings() {
  await requireAdmin()
  const [store, hours, exceptions, payments, pickups, zones] = await Promise.all([
    db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
    db.businessHours.findMany({ orderBy: { opensAt: 'asc' } }),
    db.hoursException.findMany({ orderBy: { date: 'asc' } }),
    db.paymentMethod.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.pickupPoint.findMany({ orderBy: { id: 'asc' } }),
    db.shippingZone.findMany({ orderBy: { id: 'asc' } }),
  ])

  const week: DayRanges[] = DAYS.map((d) => ({
    ...d,
    ranges: hours.filter((h) => h.weekday === d.weekday).map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt })),
  }))
  const paymentItems: CrudItem[] = payments.map((p) => ({ id: p.id, name: p.name, active: p.active, summary: p.instructions || 'Sin instrucciones', values: { name: p.name, instructions: p.instructions } }))
  const pickupItems: CrudItem[] = pickups.map((p) => ({ id: p.id, name: p.name, active: p.active, summary: p.address, values: { name: p.name, address: p.address } }))
  const zoneItems: CrudItem[] = zones.map((z) => ({ id: z.id, name: z.name, active: z.active, summary: `Envío: ${formatARS(z.cost)}`, values: { name: z.name, cost: costText(z.cost) } }))

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <nav aria-label="Secciones de ajustes" className="flex gap-2 overflow-x-auto pb-1">
          {LINKS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="flex min-h-12 shrink-0 items-center rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base font-semibold text-[#7A4FA0]">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="local" title="Local" hint="Nombre, dirección y contacto. Es lo primero que ve la gente en el sitio.">
        <StoreSection initial={{ name: store.name, tagline: store.tagline, address: store.address, whatsapp: store.whatsapp, instagram: store.instagram, mapsUrl: store.mapsUrl, wholesaleBanner: store.wholesaleBanner }} />
      </Section>

      <Section id="horarios" title="Horarios" hint="Podés cargar más de un horario por día (por ejemplo, mañana y tarde). Un día sin horarios figura cerrado.">
        <WeeklyHours initial={week} />
        <h3 className="pt-2 text-lg font-bold">Feriados y cierres con fecha</h3>
        <p className="text-sm text-[#4A3A52]">Estos días valen más que el horario de la semana.</p>
        <Exceptions rows={exceptions.map((e) => ({ id: e.id, date: e.date.toISOString().slice(0, 10), closed: e.closed, opensAt: e.opensAt, closesAt: e.closesAt, note: e.note }))} />
      </Section>

      <Section id="pagos" title="Pagos" hint="Los medios desactivados no aparecen cuando la clienta hace el pedido.">
        <CrudList
          testId="payments"
          endpoint="/api/admin/payment-methods"
          noun="medio de pago"
          article="el"
          emptyText="No hay medios de pago. Sin ninguno, nadie puede hacer un pedido."
          fields={[
            { key: 'name', label: 'Nombre', help: 'Ejemplo: Transferencia' },
            { key: 'instructions', label: 'Instrucciones para la clienta', help: 'Ejemplo: Alias, CBU y titular. Se las mostramos al terminar el pedido.', multiline: true },
          ]}
          items={paymentItems}
        />
      </Section>

      <Section id="entregas" title="Entregas" hint="Dónde retiran y a qué zonas enviás. Sin zonas activas, el sitio no ofrece envío.">
        <h3 className="text-lg font-bold">Puntos de retiro</h3>
        <CrudList
          testId="pickups"
          endpoint="/api/admin/pickup-points"
          noun="punto de retiro"
          article="el"
          emptyText="No hay puntos de retiro."
          fields={[
            { key: 'name', label: 'Nombre', help: 'Ejemplo: Local Serena Mia' },
            { key: 'address', label: 'Dirección' },
          ]}
          items={pickupItems}
        />
        <h3 className="pt-2 text-lg font-bold">Zonas de envío</h3>
        <CrudList
          testId="zones"
          endpoint="/api/admin/shipping-zones"
          noun="zona de envío"
          article="la"
          emptyText="No hay zonas de envío: el sitio no ofrece envío a domicilio."
          fields={[
            { key: 'name', label: 'Nombre de la zona', help: 'Ejemplo: Centro' },
            { key: 'cost', label: 'Costo del envío ($)', help: 'Ejemplo: 3.000,00. Poné 0 si es gratis.', inputMode: 'decimal' },
          ]}
          items={zoneItems}
        />
      </Section>

      <Section id="mayorista" title="Mayorista" hint="Cómo se ven los precios por cantidad y cuánto tiempo hay para pagar.">
        <WholesaleSection initial={{ wholesaleMode: store.wholesaleMode, wholesaleCode: store.wholesaleCode ?? '', pendingExpiryHours: store.pendingExpiryHours }} />
      </Section>
    </main>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center">Cargando ajustes…</p>}>
      <Settings />
    </Suspense>
  )
}
