export const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function generateOrderCode(rand: () => number = defaultRand): string {
  let out = 'SM-'
  for (let i = 0; i < 6; i++) {
    const idx = Math.min(ORDER_CODE_ALPHABET.length - 1, Math.floor(rand() * ORDER_CODE_ALPHABET.length))
    out += ORDER_CODE_ALPHABET[idx]
  }
  return out
}

// Los códigos no deben ser adivinables: usar el CSPRNG de la plataforma.
function defaultRand(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] / 0x100000000
}
