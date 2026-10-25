import { NextResponse } from 'next/server'
import { InvalidOrderError, OutOfStockError, placeOrder } from '@/lib/orders'
import { loadOrderConfirmation } from '@/lib/orderWhatsApp'
import { LAST_ORDER_COOKIE, ORDER_ACCESS_MAX_AGE_S, signOrderAccess } from '@/lib/orderAccess'
import { getWholesaleAccessForRequest } from '@/lib/wholesale'

type Body = Record<string, unknown>

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid_order' }, { status: 400 })
  }

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
