import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { STATUSES } from '@/lib/adminOrders'
import { InvalidOrderError, cancelOrder, extendExpiry, markOrderSeen, setOrderStatus, setPaymentStatus } from '@/lib/orders'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seen') }),
  z.object({ action: z.literal('paid') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('status'), status: z.enum(STATUSES as [string, ...string[]]) }),
  z.object({ action: z.literal('extend'), hours: z.number().int().min(1).max(24 * 30) }),
])

/** Acciones sobre un pedido: visto, pagado, cambio de estado, cancelar y extender el plazo de pago. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id: raw } = await params
  if (!/^\d+$/.test(raw)) return NextResponse.json({ error: 'El pedido no existe.' }, { status: 404 })
  const id = Number(raw)
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const body = parsed.data

  try {
    switch (body.action) {
      case 'seen':
        await markOrderSeen(id)
        break
      case 'paid':
        await setPaymentStatus(id, 'PAID')
        break
      case 'cancel':
        await cancelOrder(id)
        break
      case 'status':
        await setOrderStatus(id, body.status as Parameters<typeof setOrderStatus>[1])
        break
      case 'extend': {
        // extendExpiry fija "ahora + horas": se suman al plazo vigente para que extender nunca lo acorte.
        const o = await db.order.findUnique({ where: { id }, select: { expiresAt: true } })
        const pendingH = o?.expiresAt ? Math.max(0, Math.ceil((o.expiresAt.getTime() - Date.now()) / 3600_000)) : 0
        await extendExpiry(id, pendingH + body.hours)
        break
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof InvalidOrderError) {
      if (e.reason === 'order_not_found') return NextResponse.json({ error: 'El pedido no existe.' }, { status: 404 })
      if (e.reason === 'order_cancelled') {
        const error =
          body.action === 'paid'
            ? 'El pedido está cancelado: no se puede marcar como pagado porque el stock ya se devolvió. Si la clienta pagó, devolvele el dinero o armá un pedido nuevo.'
            : 'El pedido está cancelado y no se puede cambiar.'
        return NextResponse.json({ error }, { status: 409 })
      }
    }
    throw e
  }
}
