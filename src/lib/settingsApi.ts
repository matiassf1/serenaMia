import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { getAdminFromRequest } from '@/lib/auth'
import { SettingsValidationError } from '@/lib/settings'

/** Autentica, valida el cuerpo JSON con zod y traduce errores de validación a 400 en español. */
export async function adminJson<S extends z.ZodType>(
  req: Request,
  schema: S,
  run: (body: z.infer<S>, admin: { email: string }) => Promise<unknown>,
): Promise<NextResponse> {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, ...((await run(parsed.data, admin)) as object | undefined) })
  } catch (e) {
    if (e instanceof SettingsValidationError) return NextResponse.json({ error: e.message, field: e.field }, { status: 400 })
    throw e
  }
}
