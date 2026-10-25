import { Suspense } from 'react'
import { connection } from 'next/server'
import { db } from '@/lib/db'
import { CheckoutForm } from './CheckoutForm'

export const metadata = { title: 'Tu pedido · Serena Mia' }

async function Options() {
  await connection()
  const [payments, pickups, zones] = await Promise.all([
    db.paymentMethod.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    db.pickupPoint.findMany({ where: { active: true }, orderBy: { id: 'asc' }, select: { id: true, name: true, address: true } }),
    db.shippingZone.findMany({ where: { active: true }, orderBy: { cost: 'asc' }, select: { id: true, name: true, cost: true } }),
  ])
  return <CheckoutForm payments={payments} pickups={pickups} zones={zones} />
}

export default function CheckoutPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h2 className="font-script text-3xl font-bold text-brand-ink">Completá tu pedido</h2>
      <Suspense fallback={<p className="py-10 text-center text-muted">Cargando…</p>}>
        <Options />
      </Suspense>
    </div>
  )
}
