import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { STATUSES, STATUS_LABEL, listAdminOrders, type OrderFilter } from '@/lib/adminOrders'
import { formatARS } from '@/lib/money'

export const metadata: Metadata = { title: 'Pedidos · Serena Mia Admin' }

const pill = (active: boolean) =>
  `flex min-h-12 shrink-0 items-center justify-center rounded-xl border px-4 text-base font-semibold ${
    active ? 'border-[#C2398C] bg-[#FDECF5] text-[#8A1F60]' : 'border-[#7A4FA0]/40 bg-white text-[#4A3A52]'
  }`

const when = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Tucuman' })

async function Orders({ searchParams }: Pick<PageProps<'/admin/pedidos'>, 'searchParams'>) {
  await requireAdmin()
  const sp = await searchParams
  const estado = typeof sp.estado === 'string' ? sp.estado : ''
  const filter: OrderFilter = (STATUSES as string[]).includes(estado) ? (estado as OrderFilter) : 'ALL'
  const { orders, newCount, counts } = await listAdminOrders(filter)
  const total = STATUSES.reduce((n, s) => n + counts[s], 0)

  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Pedidos</h1>

      <p
        role="status"
        data-testid="new-orders-counter"
        className={`rounded-xl px-4 py-3 text-base font-semibold ${newCount > 0 ? 'bg-[#C2398C] text-white' : 'bg-white text-[#4A3A52]'}`}
      >
        {newCount === 0 ? 'No hay pedidos nuevos' : `${newCount} pedido${newCount === 1 ? ' nuevo' : 's nuevos'} sin ver`}
      </p>

      <nav aria-label="Filtrar por estado" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/admin/pedidos" className={pill(filter === 'ALL')} aria-current={filter === 'ALL' ? 'true' : undefined}>
          Todos ({total})
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/pedidos?estado=${s}`} className={pill(filter === s)} aria-current={filter === s ? 'true' : undefined}>
            {STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-base">No hay pedidos para mostrar.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const units = o.items.reduce((n, i) => n + i.quantity, 0)
            return (
              <li key={o.id} data-testid="admin-order">
                <Link
                  href={`/admin/pedidos/${o.id}`}
                  className="block rounded-2xl border border-[#7A4FA0]/20 bg-white p-4 active:bg-[#FDECF5]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold">{o.code}</h2>
                    {o.isNew && (
                      <span data-testid="new-badge" className="rounded-full bg-[#C2398C] px-3 py-1 text-sm font-bold text-white">
                        Nuevo
                      </span>
                    )}
                  </div>
                  <p className="break-words text-base">{o.customerName}</p>
                  <p className="text-sm text-[#4A3A52]">
                    {when.format(o.createdAt)} · {units} unidad{units === 1 ? '' : 'es'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#EFE6F6] px-3 py-1 text-sm font-semibold text-[#4B2A6B]">{STATUS_LABEL[o.status]}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        o.paymentStatus === 'PAID' ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {o.paymentStatus === 'PAID' ? 'Pagado' : 'Pago pendiente'}
                    </span>
                    <span className="ml-auto text-lg font-bold text-[#8A1F60]">{formatARS(o.total)}</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

export default function OrdersPage({ searchParams }: PageProps<'/admin/pedidos'>) {
  return (
    <Suspense fallback={<p className="py-10 text-center">Cargando pedidos…</p>}>
      <Orders searchParams={searchParams} />
    </Suspense>
  )
}
