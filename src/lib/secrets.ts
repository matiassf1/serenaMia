/** Valores de ejemplo de `.env.example`: nunca válidos en producción (el de SESSION_SECRET mide 33, así que el largo solo no los frena). */
const PLACEHOLDERS = new Set(['change-me-to-a-long-random-string', 'change-me-to-another-random-string'])
export const MIN_SECRET_LENGTH = 32

type Env = Record<string, string | undefined>

function weakness(name: string, value: string | undefined): string | null {
  if (!value) return `${name} no está definida`
  if (PLACEHOLDERS.has(value)) return `${name} tiene el valor de ejemplo de .env.example`
  if (value.length < MIN_SECRET_LENGTH) return `${name} tiene menos de ${MIN_SECRET_LENGTH} caracteres`
  return null
}

const isProduction = (env: Env) => env.NODE_ENV === 'production'

/**
 * Chequeo de arranque (src/instrumentation.ts). En producción corta el arranque si un secreto es débil;
 * en desarrollo y tests no exige nada. CRON_SECRET es opcional (sin definir, el cron queda deshabilitado),
 * pero si está definida tiene que ser fuerte.
 */
export function assertSecrets(env: Env): void {
  if (!isProduction(env)) return
  const problems = [weakness('SESSION_SECRET', env.SESSION_SECRET)]
  if (env.CRON_SECRET) problems.push(weakness('CRON_SECRET', env.CRON_SECRET))
  const found = problems.filter(Boolean)
  if (found.length) {
    throw new Error(`Configuración insegura, no se puede arrancar en producción: ${found.join('; ')}. Generá valores con: openssl rand -base64 48`)
  }
}

/** Secreto de las cookies firmadas. Falla si falta (siempre) o es débil (producción), aunque el chequeo de arranque no haya corrido. */
export function getSessionSecret(): string {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET no está definida')
  if (isProduction(process.env)) {
    const problem = weakness('SESSION_SECRET', value)
    if (problem) throw new Error(`${problem}`)
  }
  return value
}

/** Secreto del cron; null si falta, o si en producción es débil o el placeholder (así la ruta nunca autoriza). */
export function getCronSecret(): string | null {
  const value = process.env.CRON_SECRET
  if (!value) return null
  if (isProduction(process.env) && weakness('CRON_SECRET', value)) return null
  return value
}
