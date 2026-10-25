import { test, expect, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const PHONE = '3816119999'
const SLUGS = ['e2e-checkout-a', 'e2e-checkout-b', 'e2e-checkout-stock']
const A = 'E2E Checkout A'
const B = 'E2E Checkout B'
const LAST = 'E2E Checkout Ultima'
const SHOTS = process.env.E2E_SHOTS_DIR

test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

async function cleanup() {
  const products = await db.product.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const productIds = products.map((p) => p.id)
  await db.order.deleteMany({ where: { phone: '3816119999' } })
  await db.order.deleteMany({ where: { items: { some: { productId: { in: productIds } } } } })
  await db.stockLog.deleteMany({ where: { productId: { in: productIds } } })
  await db.product.deleteMany({ where: { id: { in: productIds } } })
}

test.beforeAll(async () => {
  await cleanup()
  const category = await db.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
  const mk = (slug: string, name: string, retailPrice: number, stock: number) =>
    db.product.create({ data: { slug, name, categoryId: category.id, retailPrice, stock, active: true } })
  await mk('e2e-checkout-a', A, 450000, 20)
  await mk('e2e-checkout-b', B, 320050, 20)
  await mk('e2e-checkout-stock', LAST, 100000, 1)
})

test.afterAll(async () => {
  await cleanup()
  await db.$disconnect()
})

async function addToCart(page: Page, name: string) {
  await page.goto(`/?q=${encodeURIComponent(name)}`)
  await page.getByRole('button', { name: `Agregar ${name}` }).click()
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

test('el catálogo no muestra ,00 en precios enteros y sí los centavos', async ({ page }) => {
  await page.goto(`/?q=${encodeURIComponent('E2E Checkout A')}`)
  const card = page.getByTestId('product-card').filter({ hasText: A })
  await expect(card).toContainText('4.500')
  await expect(card).not.toContainText('4.500,00')
  await page.goto(`/?q=${encodeURIComponent('E2E Checkout B')}`)
  await expect(page.getByTestId('product-card').filter({ hasText: B })).toContainText('3.200,50')
})

test('retiro + transferencia: del carrito a la confirmación con WhatsApp', async ({ page }) => {
  await addToCart(page, A)
  await addToCart(page, B)
  await page.getByRole('button', { name: /Carrito/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Tu carrito' })
  await expect(drawer.getByText(A)).toBeVisible()
  await expect(drawer.getByText(B)).toBeVisible()
  await shot(page, 'drawer')
  await drawer.getByRole('link', { name: 'Continuar con el pedido' }).click()

  await expect(page).toHaveURL(/\/checkout$/)
  await page.getByLabel('Tu nombre').fill('Ana Pérez')
  const phone = page.getByLabel('Tu teléfono')
  await expect(phone).toHaveAttribute('inputmode', 'tel')
  await phone.fill(PHONE)
  await page.getByLabel('Retiro en el local').check()
  await page.getByLabel('Transferencia').check()
  await shot(page, 'checkout')
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  await expect(page).toHaveURL(/\/pedido\/SM-[2-9A-HJKMNP-Z]{6}$/)
  await expect(page.getByRole('heading', { name: /SM-[2-9A-HJKMNP-Z]{6}/ })).toBeVisible()
  await expect(page.getByText(/Alias: SERENA\.MIA\.EJEMPLO/)).toBeVisible()
  const wa = page.getByRole('link', { name: 'Enviar pedido por WhatsApp' })
  await expect(wa).toHaveAttribute('href', /wa\.me\/54(9)?3816116380\?text=/)
  expect((await wa.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await shot(page, 'pedido')

  // El carrito se vació.
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Carrito/ })).not.toContainText(/\d/)
})

test('envío exige zona y dirección', async ({ page }) => {
  await addToCart(page, A)
  await page.goto('/checkout')
  await page.getByLabel('Tu nombre').fill('Ana Pérez')
  await page.getByLabel('Tu teléfono').fill(PHONE)
  await page.getByLabel('Envío a domicilio').check()
  await page.getByLabel('Transferencia').check()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page.getByText('Elegí a qué zona te lo enviamos')).toBeVisible()
  await page.getByLabel('Zona de envío').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page.getByText('Escribí la dirección donde lo recibís')).toBeVisible()
  await page.getByLabel('Dirección').fill('Calle Falsa 123, San Miguel')
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido\/SM-/)
})

test('si se agota el stock muestra un mensaje claro y no pierde el carrito', async ({ page }) => {
  await addToCart(page, LAST)
  await db.product.update({ where: { slug: 'e2e-checkout-stock' }, data: { stock: 0 } })
  await page.goto('/checkout')
  await page.getByLabel('Tu nombre').fill('Ana Pérez')
  await page.getByLabel('Tu teléfono').fill(PHONE)
  await page.getByLabel('Retiro en el local').check()
  await page.getByLabel('Efectivo').check()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Ya no queda stock' })).toContainText(LAST)
  await expect(page).toHaveURL(/\/checkout$/)
  await shot(page, 'checkout-error')
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Carrito/ })).toContainText('1')
})

test('/pedido/[code] sin la cookie lastOrderCode redirige a /seguimiento sin mostrar datos', async ({ page, context }) => {
  const order = await db.order.findFirstOrThrow({ where: { phone: '3816119999' }, orderBy: { id: 'desc' } })
  await context.clearCookies()
  await page.goto(`/pedido/${order.code}`)
  await expect(page).toHaveURL(/\/seguimiento/)
  await expect(page.locator('body')).not.toContainText(order.code)
  await expect(page.getByRole('link', { name: 'Enviar pedido por WhatsApp' })).toHaveCount(0)
})

test('con cookie de otro pedido tampoco muestra el pedido', async ({ page, context }) => {
  const order = await db.order.findFirstOrThrow({ where: { phone: '3816119999' }, orderBy: { id: 'desc' } })
  await context.addCookies([{ name: 'lastOrderCode', value: 'SM-ZZZZZZ', url: page.url() === 'about:blank' ? 'http://localhost:' + (process.env.E2E_PORT ?? '3000') : page.url() }])
  await page.goto(`/pedido/${order.code}`)
  await expect(page).toHaveURL(/\/seguimiento/)
})
