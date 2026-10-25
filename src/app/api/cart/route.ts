import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'

// Datos públicos de los productos del carrito (el carrito del navegador guarda solo ids y cantidades).
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 100)
  if (ids.length === 0) return NextResponse.json([])
  const products = await db.product.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, name: true, retailPrice: true, stock: true },
  })
  return NextResponse.json(products)
}
