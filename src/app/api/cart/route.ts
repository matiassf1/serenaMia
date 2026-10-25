import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getWholesaleAccessForRequest } from '@/lib/wholesale'

// Datos públicos de los productos del carrito (el carrito del navegador guarda solo ids y cantidades).
// El precio mayorista solo sale si corresponde (modo PUBLIC o código válido): en modo CODE no se filtra a quien no lo tiene.
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 100)
  if (ids.length === 0) return NextResponse.json([])
  const [products, access] = await Promise.all([
    db.product.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true, name: true, retailPrice: true, stock: true, wholesalePrice: true, wholesaleMinQty: true },
    }),
    getWholesaleAccessForRequest(req),
  ])
  return NextResponse.json(
    products.map((p) => (access.visible ? p : { ...p, wholesalePrice: null, wholesaleMinQty: null })),
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
