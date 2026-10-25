// En memoria: suficiente para una sola instancia (Railway, un servicio web).
// Con varias instancias cada una llevaría su propio contador; habría que moverlo a la base o a Redis.
type Entry = { times: number[]; windowMs: number }
const hits = new Map<string, Entry>()

const MAX_KEY_LENGTH = 200 // las claves incluyen texto del cliente (código, email): sin tope, el Map crecería sin límite
const SOFT_MAX_KEYS = 10_000
const HARD_MAX_KEYS = 50_000

// Solo en desarrollo/tests de navegador: el servidor de E2E es una sola IP que repite teléfonos. Nunca en producción.
const disabled = () => process.env.NODE_ENV !== 'production' && process.env.RATE_LIMIT_DISABLED === '1'

const norm = (key: string) => (key.length > MAX_KEY_LENGTH ? key.slice(0, MAX_KEY_LENGTH) : key)

function recent(entry: Entry | undefined, windowMs: number, now: number): number[] {
  return (entry?.times ?? []).filter((t) => now - t < windowMs)
}

function store(key: string, times: number[], windowMs: number, now: number) {
  hits.delete(key) // reinsertar mantiene el orden por antigüedad de uso
  hits.set(key, { times, windowMs })
  if (hits.size > SOFT_MAX_KEYS) {
    for (const [k, v] of hits) if (v.times.every((t) => now - t >= v.windowMs)) hits.delete(k)
  }
  if (hits.size > HARD_MAX_KEYS) {
    for (const k of hits.keys()) {
      hits.delete(k)
      if (hits.size <= HARD_MAX_KEYS) break
    }
  }
}

/** true si el intento está permitido (y se registra); false si superó `max` en los últimos `windowMs`. */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  if (disabled()) return true
  const k = norm(key)
  const now = Date.now()
  const times = recent(hits.get(k), windowMs, now)
  if (times.length >= max) {
    store(k, times, windowMs, now)
    return false
  }
  times.push(now)
  store(k, times, windowMs, now)
  return true
}

/** true si ya se llegó a `max` registros en la ventana. No registra nada (para contar solo fallos con `recordHit`). */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  if (disabled()) return false
  return recent(hits.get(norm(key)), windowMs, Date.now()).length >= max
}

/** Registra un evento (p. ej. un intento fallido) sin chequear el tope. */
export function recordHit(key: string, windowMs: number): void {
  if (disabled()) return
  const k = norm(key)
  const now = Date.now()
  const times = recent(hits.get(k), windowMs, now)
  times.push(now)
  store(k, times, windowMs, now)
}

export function resetRateLimitsForTests(): void {
  hits.clear()
}
