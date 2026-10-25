/** Últimos 10 dígitos tras quitar todo lo que no sea dígito; null si hay menos de 10. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}
