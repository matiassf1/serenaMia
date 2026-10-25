import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { createSession, SESSION_COOKIE } from '@/lib/auth'
import { getOpenStatus } from '@/lib/hours'
import { placeOrder } from '@/lib/orders'
import {
  SettingsValidationError,
  addHoursException,
  deletePaymentMethod,
  deleteShippingZone,
  removeHoursException,
  replaceWeeklyHours,
  savePaymentMethod,
  savePickupPoint,
  saveShippingZone,
  setPaymentMethodActive,
  setPickupPointActive,
  setShippingZoneActive,
  updateStoreSettings,
  updateWholesaleSettings,
} from '@/lib/settings'
import { POST as paymentRoute, PATCH as paymentPatch, DELETE as paymentDelete } from '@/app/api/admin/payment-methods/route'
import { PUT as hoursRoute } from '@/app/api/admin/hours/route'
import { PUT as settingsRoute } from '@/app/api/admin/settings/route'
import { resetDb } from './helpers'

const ADMIN = 'elias@serenamia.test'

const rejects = (p: Promise<unknown>, field?: string) =>
  expect(p).rejects.toSatisfy((e: unknown) => e instanceof SettingsValidationError && (field === undefined || e.field === field))

async function baseStore() {
  await db.storeSettings.create({
    data: { id: 1, name: 'Serena Mia', tagline: 'Estética & Insumos', address: 'Isabel la Católica 641', whatsapp: '+54 9 381 611-6380', instagram: '@serenamiaest', mapsUrl: 'https://maps.example/x', wholesaleBanner: 'Mayorista desde 6 unidades' },
  })
}

beforeEach(async () => {
  await resetDb()
})

describe('medios de pago', () => {
  it('crea, edita, desactiva y audita', async () => {
    const p = await savePaymentMethod({ name: 'Transferencia', instructions: 'Alias: SERENA.MIA' }, ADMIN)
    expect(p.active).toBe(true)
    const edited = await savePaymentMethod({ id: p.id, name: 'Transferencia', instructions: 'Alias: NUEVO.ALIAS' }, ADMIN)
    expect(edited.instructions).toBe('Alias: NUEVO.ALIAS')
    const off = await setPaymentMethodActive(p.id, false, ADMIN)
    expect(off.active).toBe(false)

    const logs = await db.auditLog.findMany({ where: { entity: 'PaymentMethod', entityId: String(p.id) }, orderBy: { id: 'asc' } })
    expect(logs.map((l) => l.action)).toEqual(['paymentMethod.create', 'paymentMethod.update', 'paymentMethod.active'])
    expect(logs.every((l) => l.adminEmail === ADMIN)).toBe(true)
    expect(logs[1].before).toMatchObject({ instructions: 'Alias: SERENA.MIA' })
    expect(logs[1].after).toMatchObject({ instructions: 'Alias: NUEVO.ALIAS' })
  })

  it('exige nombre y rechaza nombres repetidos con mensaje claro', async () => {
    await rejects(savePaymentMethod({ name: '  ', instructions: '' }, ADMIN), 'name')
    await savePaymentMethod({ name: 'Efectivo', instructions: '' }, ADMIN)
    await rejects(savePaymentMethod({ name: 'Efectivo', instructions: 'x' }, ADMIN), 'name')
  })

  it('un medio desactivado lo rechaza placeOrder y no se ofrece en el checkout', async () => {
    await baseStore()
    const cat = await db.category.create({ data: { name: 'Insumos', slug: 'insumos' } })
    const product = await db.product.create({ data: { name: 'Esmalte', slug: 'esmalte', categoryId: cat.id, retailPrice: 100000, stock: 5 } })
    const cash = await savePaymentMethod({ name: 'Efectivo', instructions: '' }, ADMIN)
    const transfer = await savePaymentMethod({ name: 'Transferencia', instructions: 'Alias' }, ADMIN)
    const pickup = await savePickupPoint({ name: 'Local', address: 'Isabel la Católica 641' }, ADMIN)
    await setPaymentMethodActive(cash.id, false, ADMIN)

    const offered = await db.paymentMethod.findMany({ where: { active: true } })
    expect(offered.map((m) => m.name)).toEqual(['Transferencia'])

    const input = { customerName: 'Ana', phone: '381 611-6380', deliveryType: 'PICKUP' as const, pickupPointId: pickup.id, items: [{ productId: product.id, quantity: 1 }], wholesaleUnlocked: false }
    await expect(placeOrder({ ...input, paymentMethodId: cash.id })).rejects.toMatchObject({ reason: 'paymentMethod' })
    await expect(placeOrder({ ...input, paymentMethodId: transfer.id })).resolves.toBeTruthy()
  })

  it('borrar: solo si nunca se usó; si tiene pedidos hay que desactivarlo', async () => {
    const unused = await savePaymentMethod({ name: 'Cheque', instructions: '' }, ADMIN)
    await deletePaymentMethod(unused.id, ADMIN)
    expect(await db.paymentMethod.count()).toBe(0)

    await baseStore()
    const cat = await db.category.create({ data: { name: 'Insumos', slug: 'insumos' } })
    const product = await db.product.create({ data: { name: 'Esmalte', slug: 'esmalte', categoryId: cat.id, retailPrice: 100000, stock: 5 } })
    const used = await savePaymentMethod({ name: 'Efectivo', instructions: '' }, ADMIN)
    const pickup = await savePickupPoint({ name: 'Local', address: 'X 1' }, ADMIN)
    await placeOrder({ customerName: 'Ana', phone: '381 611-6380', deliveryType: 'PICKUP', pickupPointId: pickup.id, paymentMethodId: used.id, items: [{ productId: product.id, quantity: 1 }], wholesaleUnlocked: false })
    await rejects(deletePaymentMethod(used.id, ADMIN))
    expect(await db.paymentMethod.count()).toBe(1)
  })
})

describe('puntos de retiro', () => {
  it('nombre y dirección obligatorios; activar/desactivar', async () => {
    await rejects(savePickupPoint({ name: 'Local', address: '' }, ADMIN), 'address')
    await rejects(savePickupPoint({ name: '', address: 'X 1' }, ADMIN), 'name')
    const p = await savePickupPoint({ name: 'Local', address: 'Isabel la Católica 641' }, ADMIN)
    const edited = await savePickupPoint({ id: p.id, name: 'Local', address: 'Otra 123' }, ADMIN)
    expect(edited.address).toBe('Otra 123')
    expect((await setPickupPointActive(p.id, false, ADMIN)).active).toBe(false)
    const logs = await db.auditLog.findMany({ where: { entity: 'PickupPoint' } })
    expect(logs).toHaveLength(3)
  })
})

describe('zonas de envío', () => {
  it('costo "3.000,50" se guarda en centavos; costo inválido o negativo se rechaza', async () => {
    const z = await saveShippingZone({ name: 'Centro', cost: '3.000,50' }, ADMIN)
    expect(z.cost).toBe(300050)
    await rejects(saveShippingZone({ name: 'Mal', cost: 'abc' }, ADMIN), 'cost')
    await rejects(saveShippingZone({ name: 'Mal', cost: '-5' }, ADMIN), 'cost')
    await rejects(saveShippingZone({ name: '', cost: '10' }, ADMIN), 'name')
    expect((await saveShippingZone({ name: 'Gratis', cost: '0' }, ADMIN)).cost).toBe(0)
  })

  it('sin zonas activas no hay envío: el checkout no lo ofrece y placeOrder lo rechaza', async () => {
    await baseStore()
    const cat = await db.category.create({ data: { name: 'Insumos', slug: 'insumos' } })
    const product = await db.product.create({ data: { name: 'Esmalte', slug: 'esmalte', categoryId: cat.id, retailPrice: 100000, stock: 5 } })
    const pay = await savePaymentMethod({ name: 'Efectivo', instructions: '' }, ADMIN)
    const zone = await saveShippingZone({ name: 'Centro', cost: '3000' }, ADMIN)
    expect(await db.shippingZone.count({ where: { active: true } })).toBe(1)
    await setShippingZoneActive(zone.id, false, ADMIN)
    expect(await db.shippingZone.count({ where: { active: true } })).toBe(0)
    await expect(
      placeOrder({ customerName: 'Ana', phone: '381 611-6380', deliveryType: 'SHIPPING', shippingZoneId: zone.id, shippingAddress: 'Calle 1', paymentMethodId: pay.id, items: [{ productId: product.id, quantity: 1 }], wholesaleUnlocked: false }),
    ).rejects.toMatchObject({ reason: 'shippingZone' })
  })

  it('borrar solo si no tiene pedidos', async () => {
    const z = await saveShippingZone({ name: 'Centro', cost: '3000' }, ADMIN)
    await deleteShippingZone(z.id, ADMIN)
    expect(await db.shippingZone.count()).toBe(0)
  })
})

describe('horarios semanales', () => {
  const WED_15H = new Date('2026-10-28T18:00:00Z') // miércoles 15:00 en Tucumán
  const status = async (now: Date) =>
    getOpenStatus(now, await db.businessHours.findMany(), await db.hoursException.findMany())

  it('reemplaza la semana con varios tramos por día y audita antes/después', async () => {
    await replaceWeeklyHours([{ weekday: 1, ranges: [{ opensAt: '10:30', closesAt: '20:00' }] }], ADMIN)
    await replaceWeeklyHours(
      [
        { weekday: 3, ranges: [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '16:00', closesAt: '20:00' }] },
        { weekday: 6, ranges: [{ opensAt: '10:00', closesAt: '14:00' }] },
      ],
      ADMIN,
    )
    const rows = await db.businessHours.findMany({ orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }] })
    expect(rows.map((r) => `${r.weekday} ${r.opensAt}-${r.closesAt}`)).toEqual(['3 09:00-13:00', '3 16:00-20:00', '6 10:00-14:00'])
    const logs = await db.auditLog.findMany({ where: { action: 'hours.weekly' }, orderBy: { id: 'asc' } })
    expect(logs).toHaveLength(2)
    expect(logs[1].before).toBeTruthy()
    expect(logs[1].adminEmail).toBe(ADMIN)
  })

  it('cambiar el horario cambia el "Abierto ahora"', async () => {
    await replaceWeeklyHours([{ weekday: 3, ranges: [{ opensAt: '10:30', closesAt: '20:00' }] }], ADMIN)
    expect((await status(WED_15H)).open).toBe(true)
    await replaceWeeklyHours([{ weekday: 3, ranges: [{ opensAt: '09:00', closesAt: '12:00' }, { opensAt: '17:00', closesAt: '20:00' }] }], ADMIN)
    const s = await status(WED_15H)
    expect(s.open).toBe(false)
    expect(s.label).toContain('abre hoy a las 17:00')
  })

  it('valida HH:mm, closesAt > opensAt y tramos que no se pisan', async () => {
    const one = (opensAt: string, closesAt: string) => replaceWeeklyHours([{ weekday: 1, ranges: [{ opensAt, closesAt }] }], ADMIN)
    await rejects(one('9:00', '12:00'), 'opensAt')
    await rejects(one('10:30', '24:00'), 'closesAt')
    await rejects(one('10:30', '10:60'), 'closesAt')
    await rejects(one('10:30', 'tarde'), 'closesAt')
    await rejects(one('12:00', '12:00'), 'closesAt')
    await rejects(one('20:00', '10:30'), 'closesAt')
    await rejects(
      replaceWeeklyHours([{ weekday: 1, ranges: [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '12:00', closesAt: '18:00' }] }], ADMIN),
      'ranges',
    )
    await rejects(replaceWeeklyHours([{ weekday: 7, ranges: [] }], ADMIN), 'weekday')
  })

  it('una validación fallida no deja la semana a medias', async () => {
    await replaceWeeklyHours([{ weekday: 1, ranges: [{ opensAt: '10:30', closesAt: '20:00' }] }], ADMIN)
    await rejects(replaceWeeklyHours([{ weekday: 2, ranges: [{ opensAt: '10:00', closesAt: '09:00' }] }], ADMIN))
    const rows = await db.businessHours.findMany()
    expect(rows.map((r) => r.weekday)).toEqual([1])
  })
})

describe('excepciones de horario', () => {
  const WED = new Date('2026-10-28T18:00:00Z')
  it('un feriado cerrado cambia el "Abierto ahora" y se puede quitar', async () => {
    await replaceWeeklyHours([{ weekday: 3, ranges: [{ opensAt: '10:30', closesAt: '20:00' }] }], ADMIN)
    const ex = await addHoursException({ date: '2026-10-28', closed: true, note: 'Feriado' }, ADMIN)
    expect(ex.date.toISOString().slice(0, 10)).toBe('2026-10-28')
    const open = async () => getOpenStatus(WED, await db.businessHours.findMany(), await db.hoursException.findMany())
    const s = await open()
    expect(s.open).toBe(false)
    expect(s.label).toContain('Feriado')
    await removeHoursException(ex.id, ADMIN)
    expect((await open()).open).toBe(true)
    const actions = (await db.auditLog.findMany({ where: { entity: 'HoursException' }, orderBy: { id: 'asc' } })).map((l) => l.action)
    expect(actions).toEqual(['hours.exception.add', 'hours.exception.remove'])
  })

  it('horario especial: exige HH:mm válido y closesAt > opensAt; fecha válida y única', async () => {
    await rejects(addHoursException({ date: '2026-13-40', closed: true, note: '' }, ADMIN), 'date')
    await rejects(addHoursException({ date: 'mañana', closed: true, note: '' }, ADMIN), 'date')
    await rejects(addHoursException({ date: '2026-10-28', closed: false, opensAt: '10:00', note: '' }, ADMIN), 'closesAt')
    await rejects(addHoursException({ date: '2026-10-28', closed: false, opensAt: '14:00', closesAt: '10:00', note: '' }, ADMIN), 'closesAt')
    await addHoursException({ date: '2026-10-28', closed: false, opensAt: '10:00', closesAt: '14:00', note: 'Medio día' }, ADMIN)
    await rejects(addHoursException({ date: '2026-10-28', closed: true, note: '' }, ADMIN), 'date')
  })
})

describe('datos del local y mayorista', () => {
  it('edita los datos del local y audita', async () => {
    await baseStore()
    const s = await updateStoreSettings(
      { name: 'Serena Mia', tagline: 'Nuevo', address: 'Calle 1', whatsapp: '+54 9 381 000-0000', instagram: '@x', mapsUrl: 'https://maps.example/y', wholesaleBanner: 'Aviso nuevo' },
      ADMIN,
    )
    expect(s.wholesaleBanner).toBe('Aviso nuevo')
    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'settings.store' } })
    expect(log.before).toMatchObject({ tagline: 'Estética & Insumos' })
    expect(log.after).toMatchObject({ tagline: 'Nuevo' })
    await rejects(updateStoreSettings({ ...s, name: ' ' }, ADMIN), 'name')
  })

  it('wholesaleMode CODE exige código; pendingExpiryHours entero positivo', async () => {
    await baseStore()
    await rejects(updateWholesaleSettings({ wholesaleMode: 'CODE', wholesaleCode: '  ', pendingExpiryHours: 48 }, ADMIN), 'wholesaleCode')
    await rejects(updateWholesaleSettings({ wholesaleMode: 'PUBLIC', wholesaleCode: null, pendingExpiryHours: 0 }, ADMIN), 'pendingExpiryHours')
    await rejects(updateWholesaleSettings({ wholesaleMode: 'PUBLIC', wholesaleCode: null, pendingExpiryHours: 1.5 }, ADMIN), 'pendingExpiryHours')
    const s = await updateWholesaleSettings({ wholesaleMode: 'CODE', wholesaleCode: ' salon2026 ', pendingExpiryHours: 24 }, ADMIN)
    expect(s).toMatchObject({ wholesaleMode: 'CODE', wholesaleCode: 'salon2026', pendingExpiryHours: 24 })
    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'settings.wholesale' } })
    // El código es un secreto: la auditoría guarda que cambió, no su valor.
    expect(JSON.stringify(log)).not.toContain('salon2026')
  })
})

describe('rutas /api/admin', () => {
  const json = (body: unknown, cookie?: string, method = 'POST') =>
    new Request('http://localhost/api/admin/x', { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })

  async function adminCookie() {
    const admin = await db.adminUser.create({ data: { email: ADMIN, passwordHash: 'x' } })
    return `${SESSION_COOKIE}=${await createSession(admin.id)}`
  }

  it('sin sesión: 401 en todas', async () => {
    expect((await paymentRoute(json({ name: 'a', instructions: '' }))).status).toBe(401)
    expect((await paymentPatch(json({ id: 1, active: false }, undefined, 'PATCH'))).status).toBe(401)
    expect((await paymentDelete(json({ id: 1 }, undefined, 'DELETE'))).status).toBe(401)
    expect((await hoursRoute(json({ days: [] }, undefined, 'PUT'))).status).toBe(401)
    expect((await settingsRoute(json({ section: 'store' }, undefined, 'PUT'))).status).toBe(401)
  })

  it('con sesión: guarda, valida con 400 en español y duplicado no es 500', async () => {
    const cookie = await adminCookie()
    const ok = await paymentRoute(json({ name: 'Transferencia', instructions: 'Alias' }, cookie))
    expect(ok.status).toBe(200)
    const dup = await paymentRoute(json({ name: 'Transferencia', instructions: 'x' }, cookie))
    expect(dup.status).toBe(400)
    expect((await dup.json()).error).toMatch(/ya existe/i)
    const bad = await hoursRoute(json({ days: [{ weekday: 1, ranges: [{ opensAt: '20:00', closesAt: '10:00' }] }] }, cookie, 'PUT'))
    expect(bad.status).toBe(400)
    expect((await bad.json()).field).toBe('closesAt')
    const garbage = await hoursRoute(json({ nope: true }, cookie, 'PUT'))
    expect(garbage.status).toBe(400)
  })
})
