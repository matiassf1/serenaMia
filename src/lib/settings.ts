import { Prisma } from '@prisma/client'
import type { BusinessHours, HoursException, PaymentMethod, PickupPoint, ShippingZone, StoreSettings, WholesaleMode } from '@prisma/client'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { parseARSToCentavos } from '@/lib/money'

export class SettingsValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'SettingsValidationError'
  }
}

const fail = (message: string, field?: string): never => {
  throw new SettingsValidationError(message, field)
}

/** Convierte el choque de nombre único de la base en un mensaje para Elías. */
async function guardUnique<T>(field: string, message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(message, field)
    throw e
  }
}

function requiredText(v: unknown, label: string, field: string, max = 200): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) fail(`Completá ${label}.`, field)
  if (s.length > max) fail(`${label[0].toUpperCase()}${label.slice(1)} es demasiado largo.`, field)
  return s
}

function optionalText(v: unknown, max = 500): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > max ? s.slice(0, max) : s
}

// ---------- Horas ----------

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function checkRange(opensAt: unknown, closesAt: unknown): { opensAt: string; closesAt: string } {
  if (typeof opensAt !== 'string' || !HHMM.test(opensAt)) fail('La hora de apertura no es válida. Usá el formato 09:30.', 'opensAt')
  if (typeof closesAt !== 'string' || !HHMM.test(closesAt)) fail('La hora de cierre no es válida. Usá el formato 20:00.', 'closesAt')
  if (toMinutes(closesAt as string) <= toMinutes(opensAt as string)) fail('La hora de cierre tiene que ser después de la de apertura.', 'closesAt')
  return { opensAt: opensAt as string, closesAt: closesAt as string }
}

// ---------- Datos del local ----------

export type StoreInput = Pick<StoreSettings, 'name' | 'tagline' | 'address' | 'whatsapp' | 'instagram' | 'mapsUrl' | 'wholesaleBanner'>
const STORE_FIELDS = ['name', 'tagline', 'address', 'whatsapp', 'instagram', 'mapsUrl', 'wholesaleBanner'] as const

export async function updateStoreSettings(input: StoreInput, adminEmail: string): Promise<StoreSettings> {
  const mapsUrl = optionalText(input.mapsUrl)
  if (mapsUrl && !/^https?:\/\//i.test(mapsUrl)) fail('El link del mapa tiene que empezar con https://', 'mapsUrl')
  const data: StoreInput = {
    name: requiredText(input.name, 'el nombre del local', 'name', 80),
    tagline: optionalText(input.tagline, 120),
    address: requiredText(input.address, 'la dirección', 'address'),
    whatsapp: requiredText(input.whatsapp, 'el WhatsApp', 'whatsapp', 40),
    instagram: optionalText(input.instagram, 80),
    mapsUrl,
    wholesaleBanner: optionalText(input.wholesaleBanner, 300),
  }
  const current = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
  const updated = await db.storeSettings.update({ where: { id: 1 }, data })
  const pick = (s: StoreSettings) => Object.fromEntries(STORE_FIELDS.map((k) => [k, s[k]]))
  await logAudit(adminEmail, 'settings.store', 'StoreSettings', '1', pick(current), pick(updated))
  return updated
}

export type WholesaleInput = { wholesaleMode: WholesaleMode; wholesaleCode: string | null; pendingExpiryHours: number }

export async function updateWholesaleSettings(input: WholesaleInput, adminEmail: string): Promise<StoreSettings> {
  if (input.wholesaleMode !== 'PUBLIC' && input.wholesaleMode !== 'CODE') fail('Elegí cómo se ven los precios mayoristas.', 'wholesaleMode')
  const code = optionalText(input.wholesaleCode, 60)
  if (input.wholesaleMode === 'CODE' && !code) fail('Para pedir código tenés que escribir el código mayorista.', 'wholesaleCode')
  const hours = input.pendingExpiryHours
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 720) {
    fail('Las horas para pagar tienen que ser un número entero entre 1 y 720.', 'pendingExpiryHours')
  }
  const current = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
  const updated = await db.storeSettings.update({
    where: { id: 1 },
    data: { wholesaleMode: input.wholesaleMode, wholesaleCode: code || null, pendingExpiryHours: hours },
  })
  // El código es un secreto: se audita que cambió, no su valor.
  const view = (s: StoreSettings) => ({ wholesaleMode: s.wholesaleMode, pendingExpiryHours: s.pendingExpiryHours, codeSet: !!s.wholesaleCode })
  await logAudit(adminEmail, 'settings.wholesale', 'StoreSettings', '1', { ...view(current) }, { ...view(updated), codeChanged: current.wholesaleCode !== updated.wholesaleCode })
  return updated
}

// ---------- Medios de pago ----------

const DUP_PAYMENT = 'Ya existe un medio de pago con ese nombre.'
const DUP_PICKUP = 'Ya existe un punto de retiro con ese nombre.'
const DUP_ZONE = 'Ya existe una zona con ese nombre.'

export async function savePaymentMethod(input: { id?: number; name: string; instructions: string }, adminEmail: string): Promise<PaymentMethod> {
  const name = requiredText(input.name, 'el nombre del medio de pago', 'name', 80)
  const instructions = optionalText(input.instructions, 1000)
  return guardUnique('name', DUP_PAYMENT, async () => {
    if (input.id === undefined) {
      const last = await db.paymentMethod.aggregate({ _max: { sortOrder: true } })
      const created = await db.paymentMethod.create({ data: { name, instructions, sortOrder: (last._max.sortOrder ?? 0) + 1 } })
      await logAudit(adminEmail, 'paymentMethod.create', 'PaymentMethod', String(created.id), null, { name, instructions })
      return created
    }
    const cur = await db.paymentMethod.findUnique({ where: { id: input.id } })
    if (!cur) return fail('Ese medio de pago ya no existe.')
    const updated = await db.paymentMethod.update({ where: { id: input.id }, data: { name, instructions } })
    await logAudit(adminEmail, 'paymentMethod.update', 'PaymentMethod', String(cur.id), { name: cur.name, instructions: cur.instructions }, { name, instructions })
    return updated
  })
}

export async function setPaymentMethodActive(id: number, active: boolean, adminEmail: string): Promise<PaymentMethod> {
  const cur = await db.paymentMethod.findUnique({ where: { id } })
  if (!cur) return fail('Ese medio de pago ya no existe.')
  const updated = await db.paymentMethod.update({ where: { id }, data: { active } })
  await logAudit(adminEmail, 'paymentMethod.active', 'PaymentMethod', String(id), { active: cur.active }, { active })
  return updated
}

export async function deletePaymentMethod(id: number, adminEmail: string): Promise<void> {
  const cur = await db.paymentMethod.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } })
  if (!cur) return fail('Ese medio de pago ya no existe.')
  if (cur._count.orders > 0) fail('Este medio de pago ya se usó en pedidos, no se puede borrar. Desactivalo para que no se ofrezca más.')
  await db.paymentMethod.delete({ where: { id } })
  await logAudit(adminEmail, 'paymentMethod.delete', 'PaymentMethod', String(id), { name: cur.name, instructions: cur.instructions }, null)
}

// ---------- Puntos de retiro ----------

export async function savePickupPoint(input: { id?: number; name: string; address: string }, adminEmail: string): Promise<PickupPoint> {
  const name = requiredText(input.name, 'el nombre del punto de retiro', 'name', 80)
  const address = requiredText(input.address, 'la dirección', 'address')
  return guardUnique('name', DUP_PICKUP, async () => {
    if (input.id === undefined) {
      const created = await db.pickupPoint.create({ data: { name, address } })
      await logAudit(adminEmail, 'pickupPoint.create', 'PickupPoint', String(created.id), null, { name, address })
      return created
    }
    const cur = await db.pickupPoint.findUnique({ where: { id: input.id } })
    if (!cur) return fail('Ese punto de retiro ya no existe.')
    const updated = await db.pickupPoint.update({ where: { id: input.id }, data: { name, address } })
    await logAudit(adminEmail, 'pickupPoint.update', 'PickupPoint', String(cur.id), { name: cur.name, address: cur.address }, { name, address })
    return updated
  })
}

export async function setPickupPointActive(id: number, active: boolean, adminEmail: string): Promise<PickupPoint> {
  const cur = await db.pickupPoint.findUnique({ where: { id } })
  if (!cur) return fail('Ese punto de retiro ya no existe.')
  const updated = await db.pickupPoint.update({ where: { id }, data: { active } })
  await logAudit(adminEmail, 'pickupPoint.active', 'PickupPoint', String(id), { active: cur.active }, { active })
  return updated
}

export async function deletePickupPoint(id: number, adminEmail: string): Promise<void> {
  const cur = await db.pickupPoint.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } })
  if (!cur) return fail('Ese punto de retiro ya no existe.')
  if (cur._count.orders > 0) fail('Este punto de retiro ya se usó en pedidos, no se puede borrar. Desactivalo para que no se ofrezca más.')
  await db.pickupPoint.delete({ where: { id } })
  await logAudit(adminEmail, 'pickupPoint.delete', 'PickupPoint', String(id), { name: cur.name, address: cur.address }, null)
}

// ---------- Zonas de envío ----------

export async function saveShippingZone(input: { id?: number; name: string; cost: string }, adminEmail: string): Promise<ShippingZone> {
  const name = requiredText(input.name, 'el nombre de la zona', 'name', 80)
  const cost = parseARSToCentavos(typeof input.cost === 'string' ? input.cost : '')
  if (cost === null) return fail('El costo de envío no es válido. Ejemplo: 3.000,00 (o 0 si es gratis).', 'cost')
  return guardUnique('name', DUP_ZONE, async () => {
    if (input.id === undefined) {
      const created = await db.shippingZone.create({ data: { name, cost } })
      await logAudit(adminEmail, 'shippingZone.create', 'ShippingZone', String(created.id), null, { name, cost })
      return created
    }
    const cur = await db.shippingZone.findUnique({ where: { id: input.id } })
    if (!cur) return fail('Esa zona ya no existe.')
    const updated = await db.shippingZone.update({ where: { id: input.id }, data: { name, cost } })
    await logAudit(adminEmail, 'shippingZone.update', 'ShippingZone', String(cur.id), { name: cur.name, cost: cur.cost }, { name, cost })
    return updated
  })
}

export async function setShippingZoneActive(id: number, active: boolean, adminEmail: string): Promise<ShippingZone> {
  const cur = await db.shippingZone.findUnique({ where: { id } })
  if (!cur) return fail('Esa zona ya no existe.')
  const updated = await db.shippingZone.update({ where: { id }, data: { active } })
  await logAudit(adminEmail, 'shippingZone.active', 'ShippingZone', String(id), { active: cur.active }, { active })
  return updated
}

export async function deleteShippingZone(id: number, adminEmail: string): Promise<void> {
  const cur = await db.shippingZone.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } })
  if (!cur) return fail('Esa zona ya no existe.')
  if (cur._count.orders > 0) fail('Esta zona ya se usó en pedidos, no se puede borrar. Desactivala para que no se ofrezca más.')
  await db.shippingZone.delete({ where: { id } })
  await logAudit(adminEmail, 'shippingZone.delete', 'ShippingZone', String(id), { name: cur.name, cost: cur.cost }, null)
}

// ---------- Horarios ----------

export type WeekDayInput = { weekday: number; ranges: { opensAt: string; closesAt: string }[] }

const weekView = (rows: BusinessHours[]) =>
  rows
    .sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt))
    .map((r) => ({ weekday: r.weekday, opensAt: r.opensAt, closesAt: r.closesAt }))

/** Reemplaza toda la semana. Valida todo antes de tocar la base, y borra + crea en una transacción. */
export async function replaceWeeklyHours(days: WeekDayInput[], adminEmail: string): Promise<BusinessHours[]> {
  const rows: { weekday: number; opensAt: string; closesAt: string }[] = []
  const seenDays = new Set<number>()
  for (const day of days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6) fail('El día de la semana no es válido.', 'weekday')
    if (seenDays.has(day.weekday)) fail('Hay un día repetido en el horario.', 'weekday')
    seenDays.add(day.weekday)
    const ranges = day.ranges.map((r) => checkRange(r.opensAt, r.closesAt)).sort((a, b) => toMinutes(a.opensAt) - toMinutes(b.opensAt))
    for (let i = 1; i < ranges.length; i++) {
      if (toMinutes(ranges[i].opensAt) < toMinutes(ranges[i - 1].closesAt)) fail('Hay dos tramos del mismo día que se pisan.', 'ranges')
    }
    for (const r of ranges) rows.push({ weekday: day.weekday, ...r })
  }
  const { before, after } = await db.$transaction(async (tx) => {
    const before = weekView(await tx.businessHours.findMany())
    await tx.businessHours.deleteMany()
    await tx.businessHours.createMany({ data: rows })
    return { before, after: weekView(await tx.businessHours.findMany()) }
  })
  await logAudit(adminEmail, 'hours.weekly', 'BusinessHours', 'weekly', before, after)
  return db.businessHours.findMany({ orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }] })
}

export type ExceptionInput = { date: string; closed: boolean; opensAt?: string | null; closesAt?: string | null; note: string }

/** Guarda la fecha como medianoche UTC: `getOpenStatus` compara por `toISOString().slice(0, 10)`. */
function parseDate(s: unknown): Date {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fail('Elegí una fecha válida.', 'date')
  const d = new Date(`${s}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return fail('Elegí una fecha válida.', 'date')
  return d
}

export async function addHoursException(input: ExceptionInput, adminEmail: string): Promise<HoursException> {
  const date = parseDate(input.date)
  let opensAt: string | null = null
  let closesAt: string | null = null
  if (!input.closed) ({ opensAt, closesAt } = checkRange(input.opensAt, input.closesAt))
  const note = optionalText(input.note, 120)
  if (await db.hoursException.findFirst({ where: { date } })) fail('Ya cargaste una excepción para esa fecha. Borrala para cargar otra.', 'date')
  const created = await db.hoursException.create({ data: { date, closed: input.closed, opensAt, closesAt, note } })
  await logAudit(adminEmail, 'hours.exception.add', 'HoursException', String(created.id), null, { date: input.date, closed: input.closed, opensAt, closesAt, note })
  return created
}

export async function removeHoursException(id: number, adminEmail: string): Promise<void> {
  const cur = await db.hoursException.findUnique({ where: { id } })
  if (!cur) return fail('Esa excepción ya no existe.')
  await db.hoursException.delete({ where: { id } })
  await logAudit(adminEmail, 'hours.exception.remove', 'HoursException', String(id), { date: cur.date.toISOString().slice(0, 10), closed: cur.closed, opensAt: cur.opensAt, closesAt: cur.closesAt, note: cur.note }, null)
}
