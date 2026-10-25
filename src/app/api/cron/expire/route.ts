import { createHash, timingSafeEqual } from 'node:crypto'
import { expireStaleOrders } from '@/lib/orders'
import { getCronSecret } from '@/lib/secrets'

// Se comparan los hashes SHA-256: tienen largo fijo, así timingSafeEqual no lanza ni filtra el largo del secreto.
function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret() // null si falta o es débil en producción: nunca autoriza
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`))
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const expired = await expireStaleOrders(new Date())
  return Response.json({ expired })
}
