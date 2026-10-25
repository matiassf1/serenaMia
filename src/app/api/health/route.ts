import { db } from '@/lib/db'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({ ok: true, db: true })
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 })
  }
}
