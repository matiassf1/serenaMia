import { describe, expect, it } from 'vitest'
import { unitPriceFor } from '@/lib/pricing'

const withWholesale = { retailPrice: 10000, wholesalePrice: 8000, wholesaleMinQty: 5 }
const retailOnly = { retailPrice: 10000, wholesalePrice: null, wholesaleMinQty: null }

describe('unitPriceFor', () => {
  it('sin precio mayorista devuelve retail', () => {
    expect(unitPriceFor(retailOnly, 100, true, 'PUBLIC')).toEqual({ unitPrice: 10000, wholesale: false })
  })

  it('cantidad por debajo del mínimo devuelve retail', () => {
    expect(unitPriceFor(withWholesale, 4, true, 'PUBLIC')).toEqual({ unitPrice: 10000, wholesale: false })
  })

  it('modo CODE sin desbloqueo devuelve retail', () => {
    expect(unitPriceFor(withWholesale, 10, false, 'CODE')).toEqual({ unitPrice: 10000, wholesale: false })
  })

  it('modo CODE desbloqueado devuelve mayorista', () => {
    expect(unitPriceFor(withWholesale, 5, true, 'CODE')).toEqual({ unitPrice: 8000, wholesale: true })
  })

  it('modo PUBLIC con cantidad >= mínimo devuelve mayorista aunque no esté desbloqueado', () => {
    expect(unitPriceFor(withWholesale, 5, false, 'PUBLIC')).toEqual({ unitPrice: 8000, wholesale: true })
  })

  it('mayorista sin mínimo definido devuelve retail', () => {
    const p = { retailPrice: 10000, wholesalePrice: 8000, wholesaleMinQty: null }
    expect(unitPriceFor(p, 50, true, 'PUBLIC')).toEqual({ unitPrice: 10000, wholesale: false })
  })
})
