// Carrito del navegador: solo {productId, quantity}. Nada de precios ni nombres (el servidor los recalcula).
export type CartItem = { productId: number; quantity: number }

export const CART_KEY = 'sm_cart'
export const MAX_QTY = 99

/** Lo que viene de localStorage puede estar editado a mano: se descarta todo lo que no sea válido. */
export function sanitizeCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return []
  const byId = new Map<number, number>()
  for (const it of raw) {
    const id = (it as CartItem | null)?.productId
    const qty = (it as CartItem | null)?.quantity
    if (!Number.isInteger(id) || (id as number) < 1 || !Number.isInteger(qty) || (qty as number) < 1) continue
    byId.set(id as number, Math.min(MAX_QTY, (byId.get(id as number) ?? 0) + (qty as number)))
  }
  return [...byId].map(([productId, quantity]) => ({ productId, quantity }))
}

export function parseCart(json: string | null): CartItem[] {
  if (!json) return []
  try {
    return sanitizeCart(JSON.parse(json))
  } catch {
    return []
  }
}

export function addItem(items: CartItem[], productId: number, quantity = 1): CartItem[] {
  const found = items.find((i) => i.productId === productId)
  if (!found) return [...items, { productId, quantity: Math.min(MAX_QTY, quantity) }]
  return items.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + quantity) } : i))
}

/** quantity <= 0 quita la línea. */
export function setQuantity(items: CartItem[], productId: number, quantity: number): CartItem[] {
  if (quantity <= 0) return items.filter((i) => i.productId !== productId)
  return items.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(MAX_QTY, quantity) } : i))
}

export function countItems(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.quantity, 0)
}
