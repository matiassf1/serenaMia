import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { expect, test, type Page } from '@playwright/test'

config()

const EMAIL = 'e2e-orders@serenamia.test'
const PASSWORD = 'clave-e2e-12345'
const PHONE = '3816117777'
const SLUG = 'e2e-orders-esmalte'
const NAME = 'E2E Pedidos Esmalte'
const db = new PrismaClient()
const SHOTS = process.env.E2E_SHOTS_DIR

test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

async function cleanup() {
  const products = await db.product.findMany({ where: { slug: SLUG }, select: { id: true } })
  const ids = products.map((p) => p.id)
  await db.order.deleteMany({ where: { OR: [{ phone: PHONE }, { items: { some: { productId: { in: ids } } } }] } })
  await db.stockLog.deleteMany({ where: { productId: { in: ids } } })
  await db.product.deleteMany({ where: { id: { in: ids } } })
}

test.beforeAll(async () => {
  await cleanup()
  const category = await db.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
  await db.product.create({ data: { slug: SLUG, name: NAME, categoryId: category.id, retailPrice: 450000, stock: 10, active: true } })
  await db.adminUser.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
    create: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  })
})

test.afterAll(async () => {
  await cleanup()
  await db.adminUser.deleteMany({ where: { email: EMAIL } })
  await db.$disconnect()
})

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

async function placeOrderOnSite(page: Page, qty = 1): Promise<string> {
  await page.goto(`/?q=${encodeURIComponent(NAME)}`)
  for (let i = 0; i < qty; i++) await page.getByRole('button', { name: `Agregar ${NAME}` }).click()
  await page.goto('/checkout')
  await page.getByLabel('Tu nombre').fill('Ana Pérez')
  await page.getByLabel('Tu teléfono').fill(PHONE)
  await page.getByLabel('Retiro en el local').check()
  await page.getByLabel('Transferencia').check()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido\/SM-[2-9A-HJKMNP-Z]{6}$/)
  return page.url().split('/').pop()!
}

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

test('pedido del sitio aparece como nuevo; Elías lo abre, lo paga y lo pasa a Listo', async ({ page, browser }) => {
  const code = await placeOrderOnSite(page)

  const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await login(admin)
  await admin.getByRole('navigation', { name: 'Panel' }).getByRole('link', { name: 'Pedidos' }).click()
  await expect(admin).toHaveURL(/\/admin\/pedidos$/)

  // Contador de nuevos y tarjetas (no tabla) a 390px.
  await expect(admin.getByTestId('new-orders-counter')).toContainText(/1 pedido nuevo/)
  await expect(admin.locator('table')).toHaveCount(0)
  const card = admin.getByTestId('admin-order').filter({ hasText: code })
  await expect(card.getByTestId('new-badge')).toBeVisible()
  expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await shot(admin, 'orders-list')

  // Abrir el detalle lo marca como visto.
  await card.getByRole('link').click()
  await expect(admin).toHaveURL(/\/admin\/pedidos\/\d+$/)
  await expect(admin.getByRole('heading', { level: 1, name: code })).toBeVisible()
  await expect(admin.getByText(`Tel: ${PHONE}`)).toBeVisible()
  await shot(admin, 'order-detail')
  const wa = admin.getByRole('link', { name: 'Escribir por WhatsApp' })
  await expect(wa).toHaveAttribute('href', new RegExp(`wa\\.me/54${PHONE}\\?text=`))
  expect((await wa.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await db.order.findUniqueOrThrow({ where: { code } })).isNew).toBe(false)

  await admin.getByRole('button', { name: 'Marcar pagado' }).click()
  await expect(admin.getByText('Pagado', { exact: true }).locator('visible=true')).toBeVisible()
  await admin.getByRole('button', { name: 'Pasar a Preparando' }).click()
  await expect(admin.getByText('Preparando', { exact: true }).locator('visible=true')).toBeVisible()
  await admin.getByRole('button', { name: 'Pasar a Listo' }).click()
  await expect(admin.getByText('Listo', { exact: true }).locator('visible=true')).toBeVisible()
  const order = await db.order.findUniqueOrThrow({ where: { code } })
  expect(order.status).toBe('READY')
  expect(order.paymentStatus).toBe('PAID')

  // La clienta ve el estado nuevo en el seguimiento público.
  await page.goto('/seguimiento')
  await page.getByLabel('Número de pedido').fill(code)
  await page.getByLabel('Tu teléfono').fill(PHONE)
  await page.getByRole('button', { name: 'Ver mi pedido' }).click()
  await expect(page.getByRole('heading', { name: code })).toBeVisible()
  await expect(page.getByTestId('timeline')).toContainText('Listo')

  // Vuelve a la lista: ya no hay nuevos y el filtro por estado funciona.
  await admin.goto('/admin/pedidos')
  await expect(admin.getByTestId('new-orders-counter')).toContainText('No hay pedidos nuevos')
  await admin.getByRole('link', { name: /^Listo \(/ }).click()
  await expect(admin.getByTestId('admin-order').filter({ hasText: code })).toBeVisible()
  await admin.getByRole('link', { name: /^Preparando \(/ }).click()
  await expect(admin.getByTestId('admin-order').filter({ hasText: code })).toHaveCount(0)
  await admin.context().close()
})

test('cancelar pide confirmación y repone el stock; extender corre el plazo', async ({ page, browser }) => {
  const before = (await db.product.findUniqueOrThrow({ where: { slug: SLUG } })).stock
  const code = await placeOrderOnSite(page, 2)
  expect((await db.product.findUniqueOrThrow({ where: { slug: SLUG } })).stock).toBe(before - 2)

  const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await login(admin)
  const { id, expiresAt } = await db.order.findUniqueOrThrow({ where: { code } })
  await admin.goto(`/admin/pedidos/${id}`)

  await admin.getByRole('button', { name: /Extender plazo de pago/ }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Plazo de pago extendido' })).toBeVisible()
  const extended = (await db.order.findUniqueOrThrow({ where: { code } })).expiresAt!
  expect(extended.getTime()).toBeGreaterThan(expiresAt!.getTime() + 23 * 3600_000)

  await admin.getByRole('button', { name: 'Cancelar pedido' }).click()
  const dialog = admin.getByRole('alertdialog', { name: 'Confirmar cancelación' })
  await expect(dialog).toBeVisible()
  await shot(admin, 'order-cancel-confirm')
  await dialog.getByRole('button', { name: 'No, volver' }).click()
  expect((await db.order.findUniqueOrThrow({ where: { code } })).status).toBe('RECEIVED')

  await admin.getByRole('button', { name: 'Cancelar pedido' }).click()
  await admin.getByRole('button', { name: 'Sí, cancelar pedido' }).click()
  await expect(admin.getByText('Cancelado', { exact: true }).locator('visible=true')).toBeVisible()
  expect((await db.order.findUniqueOrThrow({ where: { code } })).status).toBe('CANCELLED')
  expect((await db.product.findUniqueOrThrow({ where: { slug: SLUG } })).stock).toBe(before)
  await expect(admin.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
  await admin.context().close()
})

test('sin sesión, /admin/pedidos redirige al login', async ({ page }) => {
  await page.goto('/admin/pedidos')
  await expect(page).toHaveURL(/\/admin\/login$/)
})
