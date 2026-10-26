import { PageContainer } from '@/components/PageContainer'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { formatPrice } from '@/lib/money'
import { LAST_ORDER_COOKIE, verifyOrderAccess } from '@/lib/orderAccess'
import { loadOrderConfirmation } from '@/lib/orderWhatsApp'

export const metadata = { title: 'Tu pedido · Serena Mia', robots: { index: false } }

// El código solo no da acceso (spec §7): hace falta la cookie FIRMADA y de corta vida que puso POST /api/orders.
async function Confirmation({ params }: Pick<PageProps<'/pedido/[code]'>, 'params'>) {
  const { code } = await params
  const token = (await cookies()).get(LAST_ORDER_COOKIE)?.value
  await connection() // verifyOrderAccess usa Date.now(): obliga a renderizar en cada request (cacheComponents)
  if (!verifyOrderAccess(token, code)) redirect('/seguimiento')
  const data = await loadOrderConfirmation({ code: code.toUpperCase() })
  if (!data) redirect('/seguimiento')
  const { order, deliveryLabel, whatsappUrl } = data

  return (
    <PageContainer>
      <div className="rounded-2xl bg-blush p-5 text-center">
        <p className="text-base font-semibold text-violet">¡Listo! Recibimos tu pedido</p>
        <h2 className="mt-1 text-3xl font-bold text-brand-ink">{order.code}</h2>
        <p className="mt-1 text-base">Guardá este número. Con tu teléfono podés ver cómo va tu pedido.</p>
      </div>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-14 items-center justify-center rounded-full bg-brand-deep px-6 text-center text-lg font-bold text-white active:bg-brand-ink"
      >
        Enviar pedido por WhatsApp
      </a>
      <p className="-mt-2 text-center text-base text-muted">Tocá el botón para avisarnos por WhatsApp. Así lo preparamos más rápido.</p>

      <section className="flex flex-col gap-2 rounded-2xl border border-blush-border p-4">
        <h3 className="text-lg font-bold">Tu pedido</h3>
        <ul className="flex flex-col gap-1 text-base">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>
                {i.quantity} × {i.productName}
              </span>
              <span className="shrink-0">{formatPrice(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
          {order.shippingCost > 0 && (
            <li className="flex justify-between gap-3">
              <span>Envío</span>
              <span>{formatPrice(order.shippingCost)}</span>
            </li>
          )}
        </ul>
        <p className="flex justify-between border-t border-blush-border pt-2 text-lg font-bold">
          <span>Total</span>
          <span>{formatPrice(order.total)}</span>
        </p>
        <p className="text-base text-muted">{deliveryLabel}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-blush-border p-4">
        <h3 className="text-lg font-bold">Cómo pagar: {order.paymentMethod.name}</h3>
        <p className="whitespace-pre-line text-base">{order.paymentMethod.instructions}</p>
      </section>

      <Link href="/" className="flex min-h-12 items-center justify-center rounded-full border-2 border-brand-deep px-4 text-base font-semibold text-brand-ink active:bg-blush">
        Seguir mirando productos
      </Link>
    </PageContainer>
  )
}

export default function OrderPage({ params }: PageProps<'/pedido/[code]'>) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Cargando tu pedido…</p>}>
      <Confirmation params={params} />
    </Suspense>
  )
}
