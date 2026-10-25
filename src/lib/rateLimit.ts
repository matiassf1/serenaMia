// En memoria: suficiente para una sola instancia (Railway, un servicio web).
// Con varias instancias cada una llevaría su propio contador; habría que moverlo a la base o a Redis.
const hits = new Map<string, number[]>()

/** true si el intento está permitido (y se registra); false si superó `max` en los últimos `windowMs`. */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
  }
  return true
}
