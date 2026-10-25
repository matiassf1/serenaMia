'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CART_KEY, addItem, countItems, parseCart, setQuantity, type CartItem } from '@/lib/cart'
import { unitPriceFor } from '@/lib/pricing'

// Store mínimo sobre localStorage: se lee después de hidratar (el servidor siempre ve el carrito vacío).
const EMPTY: CartItem[] = []
let snapshot: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY }
let memory: CartItem[] | null = null // respaldo si localStorage no está disponible
const listeners = new Set<() => void>()

function readStorage(): string | null {
  try {
    return localStorage.getItem(CART_KEY)
  } catch {
    return null
  }
}

function getSnapshot(): CartItem[] {
  if (memory) return memory
  const raw = readStorage()
  if (raw !== snapshot.raw) snapshot = { raw, items: raw ? parseCart(raw) : EMPTY }
  return snapshot.items
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === CART_KEY) cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

function write(items: CartItem[]) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items))
    memory = null
  } catch {
    memory = items
  }
  listeners.forEach((l) => l())
}

/** wholesalePrice/wholesaleMinQty vienen null si el servidor no deja ver el mayorista (modo CODE sin desbloquear). */
export type CartProduct = {
  id: number
  name: string
  retailPrice: number
  stock: number
  wholesalePrice: number | null
  wholesaleMinQty: number | null
}

/** Mismo cálculo que placeOrder (unitPriceFor): lo que ve la clienta es lo que se cobra. */
export function cartUnitPrice(p: CartProduct, quantity: number): { unitPrice: number; wholesale: boolean } {
  return unitPriceFor(p, quantity, true, 'PUBLIC')
}

/** Aviso para volver a pedir los datos del carrito (por ejemplo, tras ingresar el código mayorista). */
export const PRICES_CHANGED_EVENT = 'sm:prices-changed'

type CartApi = {
  items: CartItem[]
  count: number
  add: (productId: number, quantity?: number) => void
  setQty: (productId: number, quantity: number) => void
  remove: (productId: number) => void
  clear: () => void
}

const CartContext = createContext<CartApi | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
  const add = useCallback((id: number, q = 1) => write(addItem(getSnapshot(), id, q)), [])
  const setQty = useCallback((id: number, q: number) => write(setQuantity(getSnapshot(), id, q)), [])
  const remove = useCallback((id: number) => write(setQuantity(getSnapshot(), id, 0)), [])
  const clear = useCallback(() => write([]), [])
  const value = useMemo(
    () => ({ items, count: countItems(items), add, setQty, remove, clear }),
    [items, add, setQty, remove, clear],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>')
  return ctx
}

/** Nombre, precio y stock de los productos del carrito, pedidos al servidor. `ready` = ya se respondió. */
export function useCartProducts(items: CartItem[]) {
  const key = items.map((i) => i.productId).sort((a, b) => a - b).join(',')
  const [state, setState] = useState<{ key: string; byId: Map<number, CartProduct> } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    window.addEventListener(PRICES_CHANGED_EVENT, bump)
    return () => window.removeEventListener(PRICES_CHANGED_EVENT, bump)
  }, [])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetch(`/api/cart?ids=${key}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CartProduct[]) => {
        if (!cancelled) setState({ key, byId: new Map(list.map((p) => [p.id, p])) })
      })
      .catch(() => {
        if (!cancelled) setState({ key, byId: new Map() })
      })
    return () => {
      cancelled = true
    }
  }, [key, version])

  const ready = key === '' || state?.key === key
  const byId = state?.byId ?? new Map<number, CartProduct>()
  const estimatedTotal = items.reduce((sum, i) => {
    const p = byId.get(i.productId)
    return sum + (p ? cartUnitPrice(p, i.quantity).unitPrice * i.quantity : 0)
  }, 0)
  return { byId, ready, estimatedTotal }
}
