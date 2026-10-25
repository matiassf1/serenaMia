import { describe, expect, it } from 'vitest'
import { addItem, countItems, parseCart, sanitizeCart, setQuantity } from '@/lib/cart'

describe('cart', () => {
  it('agrega, suma y quita líneas', () => {
    let c = addItem([], 3)
    c = addItem(c, 3)
    c = addItem(c, 5, 2)
    expect(c).toEqual([{ productId: 3, quantity: 2 }, { productId: 5, quantity: 2 }])
    expect(countItems(c)).toBe(4)
    expect(setQuantity(c, 3, 0)).toEqual([{ productId: 5, quantity: 2 }])
  })
  it('descarta datos inválidos o con campos extra (localStorage editado a mano)', () => {
    expect(
      sanitizeCart([
        { productId: 1, quantity: 2, unitPrice: 1 },
        { productId: '2', quantity: 1 },
        { productId: 3, quantity: 0 },
        { productId: 4, quantity: 1.5 },
        { productId: 1, quantity: 1 },
        null,
      ]),
    ).toEqual([{ productId: 1, quantity: 3 }])
    expect(parseCart('no json')).toEqual([])
    expect(parseCart('{"a":1}')).toEqual([])
    expect(parseCart(null)).toEqual([])
  })
})
