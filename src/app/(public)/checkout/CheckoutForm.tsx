'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { useCart, useCartProducts } from '@/components/CartProvider'
import { formatPrice } from '@/lib/money'
import { normalizePhone } from '@/lib/phone'

type Option = { id: number; name: string }
type Props = {
  payments: Option[]
  pickups: (Option & { address: string })[]
  zones: (Option & { cost: number })[]
}

const input = 'min-h-12 w-full rounded-xl border-2 border-gray-400 bg-white px-3 text-base'
const choice =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-blush-border bg-white px-3 py-2 text-base has-[:checked]:border-brand-deep has-[:checked]:bg-blush'

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-base font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-base font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  )
}

export function CheckoutForm({ payments, pickups, zones }: Props) {
  const router = useRouter()
  const { items, clear } = useCart()
  const { byId, ready, estimatedTotal } = useCartProducts(items)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [delivery, setDelivery] = useState<'PICKUP' | 'SHIPPING'>('PICKUP')
  const [pickupId, setPickupId] = useState<number | undefined>(pickups[0]?.id)
  const [zoneId, setZoneId] = useState<number | undefined>()
  const [address, setAddress] = useState('')
  const [paymentId, setPaymentId] = useState<number | undefined>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  if (items.length === 0 && !done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-blush p-6 text-center">
        <p className="text-base">Tu carrito está vacío.</p>
        <Link href="/" className="flex min-h-12 items-center rounded-full bg-brand-deep px-6 text-base font-semibold text-white active:bg-brand-ink">
          Ver productos
        </Link>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Escribí tu nombre.'
    if (!normalizePhone(phone)) next.phone = 'Revisá tu teléfono: escribilo con código de área, por ejemplo 381 611-6380.'
    if (delivery === 'PICKUP' && pickupId === undefined) next.pickup = 'Elegí dónde lo retirás.'
    if (delivery === 'SHIPPING') {
      if (zoneId === undefined) next.zone = 'Elegí a qué zona te lo enviamos.'
      if (!address.trim()) next.address = 'Escribí la dirección donde lo recibís.'
    }
    if (paymentId === undefined) next.payment = 'Elegí cómo vas a pagar.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSending(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          customerName: name.trim(),
          phone,
          deliveryType: delivery,
          ...(delivery === 'PICKUP' ? { pickupPointId: pickupId } : { shippingZoneId: zoneId, shippingAddress: address.trim() }),
          paymentMethodId: paymentId,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 201) {
        setDone(true)
        clear()
        router.push(`/pedido/${body.code}`)
        return
      }
      if (res.status === 409) {
        const product = byId.get(body.productId)?.name
        setFormError(
          `Ya no queda stock de ${product ?? 'uno de los productos'}. Sacalo del carrito o bajá la cantidad y probá de nuevo. No perdiste lo que elegiste.`,
        )
      } else if (body.field === 'phone') {
        setErrors({ phone: 'Revisá tu teléfono: escribilo con código de área, por ejemplo 381 611-6380.' })
      } else if (body.field === 'product') {
        setFormError('Alguno de los productos ya no está disponible. Revisá tu carrito.')
      } else {
        setFormError('No pudimos enviar el pedido. Revisá los datos y probá de nuevo.')
      }
    } catch {
      setFormError('No pudimos enviar el pedido. Revisá tu conexión y probá de nuevo.')
    }
    setSending(false)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <section aria-labelledby="resumen" className="flex flex-col gap-2 rounded-2xl bg-blush p-4">
        <h3 id="resumen" className="text-lg font-bold">
          Tu compra
        </h3>
        <ul className="flex flex-col gap-1 text-base">
          {items.map((i) => (
            <li key={i.productId}>
              {i.quantity} × {byId.get(i.productId)?.name ?? (ready ? 'Producto no disponible' : '…')}
            </li>
          ))}
        </ul>
        {ready && (
          <p className="text-base font-semibold">
            Subtotal: {formatPrice(estimatedTotal)}
            <span className="block text-sm font-normal text-muted">El envío y el total final los confirmamos al enviar el pedido.</span>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-bold">1. Tus datos</h3>
        <Field label="Tu nombre" htmlFor="name" error={errors.name}>
          <input id="name" className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tu teléfono" htmlFor="phone" error={errors.phone}>
          <input
            id="phone"
            className={input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="381 611-6380"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-bold">2. ¿Cómo lo recibís?</legend>
        <label className={choice}>
          <input type="radio" name="delivery" className="size-5 accent-brand-deep" checked={delivery === 'PICKUP'} onChange={() => setDelivery('PICKUP')} />
          Retiro en el local
        </label>
        {zones.length > 0 && (
          <label className={choice}>
            <input type="radio" name="delivery" className="size-5 accent-brand-deep" checked={delivery === 'SHIPPING'} onChange={() => setDelivery('SHIPPING')} />
            Envío a domicilio
          </label>
        )}
        {delivery === 'PICKUP' &&
          (pickups.length === 1 ? (
            <p className="text-base text-muted">Retirás en {pickups[0].name}: {pickups[0].address}</p>
          ) : (
            <Field label="Local de retiro" htmlFor="pickup" error={errors.pickup}>
              <select id="pickup" className={input} value={pickupId ?? ''} onChange={(e) => setPickupId(Number(e.target.value))}>
                {pickups.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.address}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        {delivery === 'SHIPPING' && (
          <>
            <Field label="Zona de envío" htmlFor="zone" error={errors.zone}>
              <select id="zone" className={input} value={zoneId ?? ''} onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Elegí tu zona</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — envío {formatPrice(z.cost)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dirección" htmlFor="address" error={errors.address}>
              <textarea
                id="address"
                className={`${input} py-2`}
                rows={3}
                autoComplete="street-address"
                placeholder="Calle, número, piso y barrio"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-bold">3. ¿Cómo pagás?</legend>
        {payments.length === 0 && <p className="text-base">Por ahora no hay medios de pago disponibles. Escribinos por WhatsApp.</p>}
        {payments.map((p) => (
          <label key={p.id} className={choice}>
            <input type="radio" name="payment" className="size-5 accent-brand-deep" checked={paymentId === p.id} onChange={() => setPaymentId(p.id)} />
            {p.name}
          </label>
        ))}
        {errors.payment && (
          <p role="alert" className="text-base font-medium text-red-800">
            {errors.payment}
          </p>
        )}
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-xl border-2 border-red-800 bg-red-50 p-3 text-base font-medium text-red-900">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="min-h-14 rounded-full bg-brand-deep px-6 text-lg font-bold text-white active:bg-brand-ink disabled:bg-gray-300 disabled:text-gray-800"
      >
        {sending ? 'Enviando…' : 'Confirmar pedido'}
      </button>
    </form>
  )
}
