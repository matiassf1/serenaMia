import { db } from '@/lib/db'

// Limpia todas las tablas de la base de test (orden irrelevante gracias a CASCADE).
export async function resetDb() {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}
