import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { seed } from '../../prisma/seed'
import { resetDb } from './helpers'

describe('seed', () => {
  beforeAll(async () => {
    await resetDb()
    await seed(db)
  })
  afterAll(async () => {
    await db.$disconnect()
  })

  it('carga los datos del local', async () => {
    const s = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(s.address).toBe('Isabel la Católica 641, San Miguel de Tucumán')
    expect(s.name).toBe('Serena Mia')
    expect(s.tagline).toBe('Estética & Insumos')
    expect(s.whatsapp).toBe('+54 9 381 611-6380')
    expect(s.pendingExpiryHours).toBe(48)
  })

  it('carga 6 tramos horarios (lun–vie y sáb)', async () => {
    const hours = await db.businessHours.findMany({ orderBy: { weekday: 'asc' } })
    expect(hours).toHaveLength(6)
    expect(hours.map((h) => h.weekday)).toEqual([1, 2, 3, 4, 5, 6])
    for (const h of hours.filter((h) => h.weekday <= 5)) {
      expect([h.opensAt, h.closesAt]).toEqual(['10:30', '20:00'])
    }
    const sat = hours.find((h) => h.weekday === 6)!
    expect([sat.opensAt, sat.closesAt]).toEqual(['10:00', '14:00'])
  })

  it('carga categorías y productos', async () => {
    const cats = await db.category.findMany({ orderBy: { sortOrder: 'asc' } })
    expect(cats.map((c) => c.name)).toEqual(['Insumos', 'Cosmetología'])
    const products = await db.product.findMany({ where: { active: true, stock: { gt: 0 } } })
    expect(products.length).toBeGreaterThanOrEqual(6)
    expect(products.some((p) => p.wholesalePrice !== null && p.wholesaleMinQty !== null)).toBe(true)
  })

  it('carga pagos, retiro y envío', async () => {
    const pm = await db.paymentMethod.findMany()
    expect(pm.map((p) => p.name).sort()).toEqual(['Efectivo', 'Transferencia'])
    const pickups = await db.pickupPoint.findMany()
    expect(pickups).toHaveLength(1)
    expect(pickups[0].address).toBe('Isabel la Católica 641, San Miguel de Tucumán')
    expect(await db.shippingZone.count()).toBe(1)
  })

  it('es idempotente', async () => {
    const counts = async () => [
      await db.businessHours.count(),
      await db.category.count(),
      await db.product.count(),
      await db.paymentMethod.count(),
      await db.pickupPoint.count(),
      await db.shippingZone.count(),
      await db.storeSettings.count(),
    ]
    const before = await counts()
    await seed(db)
    expect(await counts()).toEqual(before)
  })
})
