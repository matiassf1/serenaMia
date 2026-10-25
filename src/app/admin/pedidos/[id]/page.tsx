import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { STATUS_LABEL, customerWhatsAppUrl, nextStatus } from '@/lib/adminOrders'
import { formatARS } from '@/lib/money'
import { markOrderSeen } from '@/lib/orders'
import OrderActions from './OrderActions'

export const metadata: Metadata = { title: 'Pedido · Serena Mia Admin' }

const when = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Tucuman' })

const NEXT_LABEL = { PREPARING: 'Pasar a Preparando', READY: 'Pasar a Listo', DELIVERED: 'Pasar a Entregado' } as const

async function OrderDetail({ params }: Pick<PageProps<'/admin/pedidos/[id]'>, 'params'>) {
  await requireAdmin()
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const order = await db.order.findUnique({
    where: { id: Number(id) },
    include: { items: { orderBy: { id: 'asc' } }, paymentMethod: true, pickupPoint: true, shippingZone: true },
  })
  if (!order) notFound()
  if (order.isNew) await markOrderSeen(order.id) // abrir el detalle = lo vio

  const next = nextStatus(order.status)
  const cancelled = order.status === 'CANCELLED'
  const canExtend = !cancelled && order.paymentStatus === 'PENDING' && order.status === 'RECEIVED'

  return (
    <main className="mx-auto max-w-xl space-y-4">
      <Link href="/admin/pedidos" className="flex min-h-12 items-center text-base font-semibold text-[#7A4FA0] underline">
        ← Volver a pedidos
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{order.code}</h1>
        <span className="rounded-full bg-[#EFE6F6] px-3 py-1 text-sm font-semibold text-[#4B2A6B]">{STATUS_LABEL[order.status]}</span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}
        >
          {order.paymentStatus === 'PAID' ? 'Pagado' : 'Pago pendiente'}
        </span>
      </div>

      <section className="space-y-1 rounded-2xl border border-[#7A4FA0]/20 bg-white p-4 text-base">
        <p className="font-bold">{order.customerName}</p>
        <p>Tel: {order.rawPhone}</p>
        <p>Pedido: {when.format(order.createdAt)}</p>
        <p>
          {order.deliveryType === 'PICKUP'
            ? `Retiro en ${order.pickupPoint?.name ?? 'el local'}`
            : `Envío a ${order.shippingAddress ?? ''} (${order.shippingZone?.name ?? ''})`}
        </p>
        <p>Pago: {order.paymentMethod.name}</p>
        {order.paymentStatus === 'PENDING' && order.expiresAt && !cancelled && order.status === 'RECEIVED' && (
          <p data-testid="expires-at" className="font-semibold text-amber-900">
            Se cancela solo si no pagan antes del {when.format(order.expiresAt)}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#7A4FA0]/20 bg-white p-4">
        <h2 className="mb-2 text-lg font-bold">Productos</h2>
        <ul className="space-y-1 text-base">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span className="min-w-0 break-words">
                {i.quantity} × {i.productName}
              </span>
              <span className="shrink-0">{formatARS(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
          {order.shippingCost > 0 && (
            <li className="flex justify-between gap-3">
              <span>Envío</span>
              <span>{formatARS(order.shippingCost)}</span>
            </li>
          )}
        </ul>
        <p className="mt-2 flex justify-between border-t border-[#7A4FA0]/20 pt-2 text-lg font-bold">
          <span>Total</span>
          <span>{formatARS(order.total)}</span>
        </p>
      </section>

      <a
        href={customerWhatsAppUrl(order)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#14633A] px-4 text-base font-semibold text-white active:bg-[#0F4F2E]"
      >
        Escribir por WhatsApp
      </a>

      <OrderActions
        id={order.id}
        status={order.status}
        paid={order.paymentStatus === 'PAID'}
        cancelled={cancelled}
        next={next ? { value: next, label: NEXT_LABEL[next as keyof typeof NEXT_LABEL] } : null}
        canExtend={canExtend}
      />
    </main>
  )
}

export default function OrderDetailPage({ params }: PageProps<'/admin/pedidos/[id]'>) {
  return (
    <Suspense fallback={<p className="py-10 text-center">Cargando…</p>}>
      <OrderDetail params={params} />
    </Suspense>
  )
}
