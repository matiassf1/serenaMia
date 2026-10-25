import { z } from 'zod'

/** Postgres `Int` es de 32 bits: un id o cantidad mayor desborda en la base y daría 500 en vez de 400. */
export const DB_INT_MAX = 2_147_483_647
export const MAX_STOCK = 1_000_000
/** $ 10.000.000,00 en centavos: muy por encima de cualquier precio real y lejos del desborde de Int. */
export const MAX_PRICE_CENTS = 1_000_000_000

export const dbId = z.number().int().min(1).max(DB_INT_MAX)

/** Id que viene como texto (URL o formulario): solo dígitos y dentro del rango; null si no puede existir. */
export function parseDbId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= DB_INT_MAX ? n : null
}
