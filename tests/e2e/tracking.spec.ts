import { test, expect } from '@playwright/test'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const PHONE = '3816118888'
const SLUG = 'e2e-tracking'
const SHOTS = process.env.E2E_SHOTS_DIR

test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

let code: string
let orderId: number

async function cleanup() {
  const products = await db.product.findMany({ where: { slug: SLUG }, select: { id: true } })
  const productIds = products.map((p) => p.id)
  await db.order.deleteMany({ where: { phone: PHONE } })
  await db.stockLog.deleteMany({ where: { productId: { in: productIds } } })
  await db.product.deleteMany({ where: { id: { in: productIds } } })
}

test.beforeAll(async () => {
  await cleanup()
  const category = await db.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
  const product = await db.product.create({
    data: { slug: SLUG, name: 'E2E Seguimiento', categoryId: category.id, retailPrice: 250000, stock: 20, active: true },
  })
  const order = await db.order.create({
    data: {
      code: 'SM-TRACK2',
      customerName: 'Ana Pérez',
      phone: PHONE,
      rawPhone: '381 611 8888',
      deliveryType: 'PICKUP',
      pickupPointId: (await db.pickupPoint.findFirstOrThrow()).id,
      paymentMethodId: (await db.paymentMethod.findFirstOrThrow()).id,
      subtotal: 500000,
      shippingCost: 0,
      total: 500000,
      expiresAt: new Date(Date.now() + 48 * 3600_000),
      items: { create: [{ productId: product.id, productName: 'E2E Seguimiento', quantity: 2, unitPrice: 250000 }] },
    },
  })
  code = order.code
  orderId = order.id
})

test.afterAll(async () => {
  await cleanup()
  await db.$disconnect()
})

async function track(page: import('@playwright/test').Page, c: string, phone: string) {
  await page.goto('/seguimiento')
  await page.getByLabel('Número de pedido').fill(c)
  await page.getByLabel('Tu teléfono').fill(phone)
  await page.getByRole('button', { name: 'Ver mi pedido' }).click()
}

test('código en minúsculas y con espacios: muestra la línea de tiempo con el estado actual', async ({ page }) => {
  await track(page, `  ${code.toLowerCase()}  `, '381 611 8888')
  await expect(page.getByRole('heading', { name: code })).toBeVisible()
  const steps = page.getByTestId('timeline').getByRole('listitem')
  await expect(steps).toHaveText([/Recibido/, /Preparando/, /Listo/, /Entregado/])
  await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByText('2 × E2E Seguimiento')).toBeVisible()
  await expect(page.getByText('Pago pendiente')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seguimiento-recibido.png`, fullPage: true })
})

test('el estado avanza en la línea de tiempo', async ({ page }) => {
  await db.order.update({ where: { id: orderId }, data: { status: 'READY' } })
  await track(page, code, PHONE)
  const steps = page.getByTestId('timeline').getByRole('listitem')
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(steps.nth(3)).not.toHaveAttribute('aria-current', 'step')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seguimiento-listo.png`, fullPage: true })
})

test('pedido cancelado muestra un estado claro, sin línea de tiempo', async ({ page }) => {
  await db.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } })
  await track(page, code, PHONE)
  await expect(page.getByText('Pedido cancelado')).toBeVisible()
  await expect(page.getByTestId('timeline')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seguimiento-cancelado.png`, fullPage: true })
})

test('teléfono o código incorrectos dan el mismo mensaje, sin revelar cuál falló', async ({ page }) => {
  await track(page, code, '381 555 0000')
  const alert = page.getByRole('alert').filter({ hasText: 'No encontramos ese pedido' })
  const a = await alert.innerText()
  await track(page, 'SM-ZZZZZZ', PHONE)
  expect(await alert.innerText()).toBe(a)
})

test('al llegar redirigida desde /pedido/[code] sin cookie, la página funciona', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto(`/pedido/${code}`)
  await expect(page).toHaveURL(/\/seguimiento/)
  await expect(page.getByLabel('Número de pedido')).toBeVisible()
  await expect(page.getByLabel('Tu teléfono')).toBeVisible()
  expect((await page.getByRole('button', { name: 'Ver mi pedido' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.locator('body')).not.toContainText(code)
})
