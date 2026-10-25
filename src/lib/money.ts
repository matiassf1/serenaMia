import { MAX_PRICE_CENTS } from '@/lib/bounds'

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export function formatARS(centavos: number): string {
  return ars.format(centavos / 100)
}

const arsWhole = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/** Precio para mostrar: sin ",00" en importes enteros; con decimales solo si hay centavos. */
export function formatPrice(centavos: number): string {
  return centavos % 100 === 0 ? arsWhole.format(centavos / 100) : formatARS(centavos)
}

/** Acepta `1.234,50`, `1234,5`, `1234.5` y `$ 1.234`. Devuelve centavos enteros o null (también si pasa de $ 10.000.000). */
export function parseARSToCentavos(input: string): number | null {
  let s = input.replace(/[\s$]/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // El último separador es el decimal; el otro es de miles.
    const dec = Math.max(lastComma, lastDot)
    const thousands = lastComma > lastDot ? '.' : ','
    s = s.slice(0, dec).split(thousands).join('') + '.' + s.slice(dec + 1)
  } else if (lastComma !== -1) {
    if (s.indexOf(',') !== lastComma) return null
    s = s.replace(',', '.')
  } else if (lastDot !== -1) {
    const parts = s.split('.')
    // "1.234" o "1.234.567" (grupos de 3) son miles; "1234.5" es decimal.
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3)) {
      if (!parts.slice(1).every((p) => p.length === 3)) return null
      s = parts.join('')
    }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return cents > MAX_PRICE_CENTS ? null : cents
}
