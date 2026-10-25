const MAX_LENGTH = 64

/**
 * IP del cliente para los límites de intentos.
 *
 * Railway pone exactamente UN proxy delante de la app y ese proxy AGREGA la IP real al final de
 * `x-forwarded-for`; todo lo que está a la izquierda lo escribió el cliente y se puede inventar.
 * Por eso se toma la entrada MÁS A LA DERECHA (nunca la primera). Si algún día hay más de un proxy
 * delante (CDN + Railway), hay que correr este índice: una entrada más a la izquierda por cada salto.
 * Sin `x-forwarded-for` (desarrollo, tests) se usa `x-real-ip` y por último "unknown".
 */
export function clientIp(req: Request): string {
  const parts = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const ip = parts[parts.length - 1] || req.headers.get('x-real-ip')?.trim() || 'unknown'
  return ip.slice(0, MAX_LENGTH)
}
