import { NextResponse } from 'next/server'
import { clientIp } from '@/lib/clientIp'
import { normalizePhone } from '@/lib/phone'
import { checkRateLimit } from '@/lib/rateLimit'
import { InvalidOrderError, OutOfStockError, placeOrder } from '@/lib/orders'
import { loadOrderConfirmation } from '@/lib/orderWhatsApp'
import { LAST_ORDER_COOKIE, ORDER_ACCESS_MAX_AGE_S, signOrderAccess } from '@/lib/orderAccess'
import { getWholesaleAccessForRequest } from '@/lib/wholesale'

type Body = Record<string, unknown>

// Cada pedido reserva stock por `pendingExpiryHours`: sin tope, un bot deja el catálogo "Sin stock".
// Los intentos se cuentan al entrar (también los que fallan por stock) para que ráfagas en paralelo no los esquiven.
const WINDOW_MS = 60 * 60_000
const MAX_PER_IP = 10 // más holgado que por teléfono: varias personas pueden compartir la IP (wifi de un salón)
const MAX_PER_PHONE = 5
const MAX_BODY_CHARS = 50_000

const tooMany = () =>
  NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(WINDOW_MS / 1000) } })

export async function POST(req: Request) {
  if (!checkRateLimit(`orders-ip:${clientIp(req)}`, MAX_PER_IP, WINDOW_MS)) return tooMany()

  const text = await req.text().catch(() => '')
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'too_large' }, { status: 413 })
  let body: Body | null = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid_order' }, { status: 400 })
  }

  // Por teléfono normalizado: "381 611-6380", "+54 9 381 611 6380" y "03816116380" son la misma persona.
  const phone = typeof body.phone === 'string' && body.phone.length <= 40 ? normalizePhone(body.phone) : null
  if (phone && !checkRateLimit(`orders-phone:${phone}`, MAX_PER_PHONE, WINDOW_MS)) return tooMany()

  try {
    // Solo se copian los campos permitidos: precios, totales y envío del cliente nunca llegan al servicio.
    // wholesaleUnlocked sale de la cookie firmada con el código vigente, nunca del body.
    const { unlocked } = await getWholesaleAccessForRequest(req)
    const placed = await placeOrder({
      items: Array.isArray(body.items)
        ? body.items.map((i: Body) => ({ productId: i?.productId as number, quantity: i?.quantity as number }))
        : [],
      customerName: body.customerName as string,
      phone: body.phone as string,
      deliveryType: body.deliveryType as 'PICKUP' | 'SHIPPING',
      pickupPointId: body.pickupPointId as number | undefined,
      shippingZoneId: body.shippingZoneId as number | undefined,
      shippingAddress: body.shippingAddress as string | undefined,
      paymentMethodId: body.paymentMethodId as number,
      wholesaleUnlocked: unlocked,
    })
    const confirmation = await loadOrderConfirmation({ id: placed.id })
    const res = NextResponse.json(
      { code: placed.code, total: placed.total, whatsappUrl: confirmation?.whatsappUrl ?? null },
      { status: 201 },
    )
    // Quien hizo el pedido puede ver /pedido/[code] por un rato; la cookie va firmada, el código solo no da acceso (spec §7).
    res.cookies.set(LAST_ORDER_COOKIE, signOrderAccess(placed.code), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ORDER_ACCESS_MAX_AGE_S,
    })
    return res
  } catch (e) {
    if (e instanceof OutOfStockError) {
      return NextResponse.json({ error: 'out_of_stock', productId: e.productId }, { status: 409 })
    }
    if (e instanceof InvalidOrderError) {
      return NextResponse.json({ error: 'invalid_order', field: e.reason }, { status: 400 })
    }
    throw e
  }
}
