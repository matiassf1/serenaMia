/** Destino de "Cómo llegar": el link que cargó el admin o, si lo dejó vacío, una búsqueda en Google Maps con la dirección. */
export function mapsHref(mapsUrl: string | null | undefined, address: string): string {
  const url = mapsUrl?.trim()
  if (url) return url
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
}
