import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue)
}

/** Registro simple de quién cambió qué (precios y stock), spec §7. */
export async function logAudit(
  adminEmail: string,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await db.auditLog.create({
    data: { adminEmail, action, entity, entityId, before: toJson(before), after: toJson(after) },
  })
}
