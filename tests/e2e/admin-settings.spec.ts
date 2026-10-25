import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { expect, test, type Page } from '@playwright/test'

config()

const EMAIL = 'e2e-settings@serenamia.test'
const PASSWORD = 'clave-e2e-12345'
const STAMP = Date.now()
const PAY = `Pago E2E ${STAMP}`
const ZONE = `Zona E2E ${STAMP}`
const PICKUP = `Retiro E2E ${STAMP}`
const NOTE = `Cierre E2E ${STAMP}`
const PRODUCT = `Producto Ajustes ${STAMP}`
const SHOTS = process.env.E2E_SHOTS_DIR
const db = new PrismaClient()

test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

const todayInTucuman = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Tucuman', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

async function cleanup() {
  await db.paymentMethod.deleteMany({ where: { name: { contains: 'E2E' }, orders: { none: {} } } })
  await db.shippingZone.deleteMany({ where: { name: { contains: 'E2E' }, orders: { none: {} } } })
  await db.pickupPoint.deleteMany({ where: { name: { contains: 'E2E' }, orders: { none: {} } } })
  await db.hoursException.deleteMany({ where: { note: { contains: 'E2E' } } })
  await db.product.deleteMany({ where: { name: { startsWith: 'Producto Ajustes' } } })
  await db.auditLog.deleteMany({ where: { adminEmail: EMAIL } })
}

let originalStore: { wholesaleBanner: string; wholesaleMode: 'PUBLIC' | 'CODE'; wholesaleCode: string | null; pendingExpiryHours: number }

test.beforeAll(async () => {
  await cleanup()
  originalStore = await db.storeSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { wholesaleBanner: true, wholesaleMode: true, wholesaleCode: true, pendingExpiryHours: true },
  })
  await db.adminUser.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
    create: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  })
  const category = await db.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
  await db.product.create({ data: { name: PRODUCT, slug: `producto-ajustes-${STAMP}`, categoryId: category.id, retailPrice: 100000, stock: 5 } })
})

test.afterAll(async () => {
  await db.storeSettings.update({ where: { id: 1 }, data: originalStore })
  await cleanup()
  await db.adminUser.deleteMany({ where: { email: EMAIL } })
  await db.$disconnect()
})

test('pagos y entregas: crear, editar y desactivar se refleja en el checkout', async ({ page }) => {
  await login(page)
  await page.goto('/admin/ajustes')
  await shot(page, 'ajustes-top')

  // Pagos: alta con instrucciones (alias/CBU).
  const payments = page.getByTestId('payments')
  await payments.getByRole('button', { name: '+ Agregar un medio de pago' }).click()
  await payments.getByLabel('Nombre', { exact: true }).fill(PAY)
  await payments.getByLabel(/^Instrucciones/).fill('Alias: E2E.ALIAS\nCBU: 0000')
  await payments.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(payments.getByRole('status')).toContainText('Guardado')
  const payItem = payments.getByTestId('payments-item').filter({ hasText: PAY })
  await expect(payItem).toContainText('Alias: E2E.ALIAS')
  await expect(payItem).toContainText('Activo')

  // Retiro y zona.
  const pickups = page.getByTestId('pickups')
  await pickups.getByRole('button', { name: '+ Agregar un punto de retiro' }).click()
  await pickups.getByLabel('Nombre', { exact: true }).fill(PICKUP)
  await pickups.getByLabel('Dirección').fill('Calle Falsa 123')
  await pickups.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(pickups.getByTestId('pickups-item').filter({ hasText: PICKUP })).toContainText('Calle Falsa 123')

  const zones = page.getByTestId('zones')
  await zones.getByRole('button', { name: '+ Agregar una zona de envío' }).click()
  await zones.getByLabel('Nombre de la zona').fill(ZONE)
  await zones.getByLabel(/^Costo/).fill('3.250,50')
  await zones.getByRole('button', { name: 'Guardar', exact: true }).click()
  const zoneItem = zones.getByTestId('zones-item').filter({ hasText: ZONE })
  await expect(zoneItem).toContainText('3.250,50')
  expect((await db.shippingZone.findFirstOrThrow({ where: { name: ZONE } })).cost).toBe(325050)

  // Targets táctiles ≥ 44 px.
  for (const target of [
    payItem.getByRole('button', { name: `Editar ${PAY}` }),
    payItem.getByRole('button', { name: `Desactivar ${PAY}` }),
    payItem.getByRole('button', { name: `Borrar ${PAY}` }),
    page.getByRole('button', { name: 'Guardar datos del local' }),
  ]) {
    const box = await target.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  // Público: el medio, el retiro y la zona aparecen en el checkout.
  await page.goto(`/?q=${encodeURIComponent(PRODUCT)}`)
  await page.getByRole('button', { name: `Agregar ${PRODUCT}` }).click()
  await page.goto('/checkout')
  await expect(page.getByLabel(PAY)).toBeVisible()
  await page.getByLabel('Envío a domicilio').check()
  await expect(page.getByLabel('Zona de envío').locator('option', { hasText: ZONE })).toHaveCount(1)
  await shot(page, 'checkout-con-opciones')

  // Desactivar: desaparecen del checkout.
  await page.goto('/admin/ajustes')
  await page.getByTestId('payments').getByRole('button', { name: `Desactivar ${PAY}` }).click()
  await expect(page.getByTestId('payments').getByTestId('payments-item').filter({ hasText: PAY })).toContainText('Desactivado')
  await page.getByTestId('zones').getByRole('button', { name: `Desactivar ${ZONE}` }).click()
  await expect(page.getByTestId('zones').getByTestId('zones-item').filter({ hasText: ZONE })).toContainText('Desactivado')
  await page.goto('/checkout')
  await expect(page.getByLabel('Tu nombre')).toBeVisible()
  await expect(page.getByLabel(PAY)).toHaveCount(0)
  await page.getByLabel('Envío a domicilio').check()
  await expect(page.getByLabel('Zona de envío').locator('option', { hasText: ZONE })).toHaveCount(0)

  // Editar mantiene el estado y audita; nombre repetido da un error claro.
  await page.goto('/admin/ajustes')
  await page.getByRole('button', { name: `Editar ${PAY}` }).click()
  await page.getByTestId('payments').getByLabel(/^Instrucciones/).fill('Alias: E2E.NUEVO')
  await page.getByTestId('payments').getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByTestId('payments').getByTestId('payments-item').filter({ hasText: PAY })).toContainText('E2E.NUEVO')
  await page.getByTestId('payments').getByRole('button', { name: '+ Agregar un medio de pago' }).click()
  await page.getByTestId('payments').getByLabel('Nombre', { exact: true }).fill(PAY)
  await page.getByTestId('payments').getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByTestId('payments').getByRole('alert')).toContainText('Ya existe')

  // Borrar pide confirmación (primero "No", después "Sí").
  await page.getByTestId('zones').getByRole('button', { name: `Borrar ${ZONE}` }).click()
  await page.getByTestId('zones').getByRole('button', { name: 'No', exact: true }).click()
  expect(await db.shippingZone.count({ where: { name: ZONE } })).toBe(1)
  await page.getByTestId('zones').getByRole('button', { name: `Borrar ${ZONE}` }).click()
  await page.getByTestId('zones').getByRole('button', { name: 'Sí, borrar' }).click()
  await expect(page.getByTestId('zones').getByTestId('zones-item').filter({ hasText: ZONE })).toHaveCount(0)

  const pay = await db.paymentMethod.findFirstOrThrow({ where: { name: PAY } })
  const audits = await db.auditLog.findMany({ where: { entity: 'PaymentMethod', entityId: String(pay.id) } })
  expect(audits.map((a) => a.action).sort()).toEqual(['paymentMethod.active', 'paymentMethod.create', 'paymentMethod.update'])
  expect(audits.every((a) => a.adminEmail === EMAIL)).toBe(true)
})

test('horarios: una excepción de hoy cambia el "Abierto ahora" del sitio y se puede quitar', async ({ page }) => {
  await login(page)
  await page.goto('/admin/ajustes')
  const form = page.getByRole('form', { name: 'Agregar excepción' })
  await form.getByLabel('Fecha').fill(todayInTucuman())
  await form.getByLabel(/^Motivo/).fill(NOTE)
  await form.getByRole('button', { name: 'Agregar excepción' }).click()
  await expect(form.getByRole('status')).toContainText('Guardado')
  await expect(page.getByTestId('exception-item').filter({ hasText: NOTE })).toContainText('Cerrado todo el día')
  await shot(page, 'ajustes-horarios')

  try {
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: `Cerrado · ${NOTE}` })).toBeVisible()

    await page.goto('/admin/ajustes')
    await page.getByRole('button', { name: /^Borrar excepción/ }).first().click()
    await page.getByRole('button', { name: 'No', exact: true }).click()
    expect(await db.hoursException.count({ where: { note: NOTE } })).toBe(1)
    await page.getByRole('button', { name: /^Borrar excepción/ }).first().click()
    await page.getByRole('button', { name: 'Sí, borrar' }).click()
    await expect(page.getByTestId('exception-item').filter({ hasText: NOTE })).toHaveCount(0)

    await page.goto('/')
    await expect(page.getByText(/^(Abierto|Cerrado)/).first()).toBeVisible()
    await expect(page.getByText(NOTE)).toHaveCount(0)
  } finally {
    await db.hoursException.deleteMany({ where: { note: NOTE } })
  }
})

test('horarios semanales: varios tramos por día y validación closesAt > opensAt', async ({ page }) => {
  await login(page)
  await page.goto('/admin/ajustes')
  const sunday = page.getByTestId('day-0')
  const before = await db.businessHours.count()
  await sunday.getByRole('button', { name: 'Agregar tramo al Domingo' }).click()
  await sunday.getByRole('button', { name: 'Agregar tramo al Domingo' }).click()
  await expect(sunday.getByLabel('Domingo: abre (tramo 2)')).toBeVisible()
  await sunday.getByLabel('Domingo: cierra (tramo 1)').fill('09:00') // antes de las 10:00 de apertura
  await page.getByRole('button', { name: 'Guardar horarios' }).click()
  await expect(page.locator('#horarios').getByRole('alert')).toContainText('después')
  expect(await db.businessHours.count()).toBe(before) // no se guardó nada

  // Camino feliz: recargar (descarta los cambios) y guardar la semana tal cual queda igual y confirma.
  await page.goto('/admin/ajustes')
  await page.getByRole('button', { name: 'Guardar horarios' }).click()
  await expect(page.locator('#horarios').getByRole('status')).toContainText('Guardado')
  expect(await db.businessHours.count()).toBe(before)
})

test('local y mayorista: validación, guardado y confirmación visible', async ({ page }) => {
  await login(page)
  await page.goto('/admin/ajustes')
  await page.goto('/admin/ajustes#mayorista')

  // Modo código sin código → error claro, sin guardar.
  await page.getByLabel('Solo con código').check()
  await page.getByRole('button', { name: 'Guardar mayorista' }).click()
  await expect(page.locator('#mayorista').getByRole('alert')).toContainText('código')
  expect((await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).wholesaleMode).toBe(originalStore.wholesaleMode)

  // Con código y plazo inválido → error de plazo.
  await page.getByLabel('Código mayorista').fill('E2E-SALON')
  await page.getByLabel('Horas para pagar un pedido').fill('0')
  await page.getByRole('button', { name: 'Guardar mayorista' }).click()
  await expect(page.locator('#mayorista').getByRole('alert')).toContainText('entre 1 y 720')

  try {
    await page.getByLabel('Horas para pagar un pedido').fill('24')
    await page.getByRole('button', { name: 'Guardar mayorista' }).click()
    await expect(page.locator('#mayorista').getByRole('status')).toContainText('Guardado')
    const s = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(s).toMatchObject({ wholesaleMode: 'CODE', wholesaleCode: 'E2E-SALON', pendingExpiryHours: 24 })
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'settings.wholesale', adminEmail: EMAIL } })
    expect(JSON.stringify(audit)).not.toContain('E2E-SALON')

    // Datos del local + aviso mayorista.
    await page.getByLabel('Aviso mayorista').fill(`Aviso E2E ${STAMP}`)
    await page.getByRole('button', { name: 'Guardar datos del local' }).click()
    await expect(page.locator('#local').getByRole('status')).toContainText('Guardado')
    expect((await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).wholesaleBanner).toBe(`Aviso E2E ${STAMP}`)
    await page.getByLabel('Nombre del local').fill('')
    await page.getByRole('button', { name: 'Guardar datos del local' }).click()
    await expect(page.locator('#local').getByRole('alert')).toContainText('nombre')
    await shot(page, 'ajustes-mayorista')
  } finally {
    await db.storeSettings.update({ where: { id: 1 }, data: originalStore })
  }
})
