import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

config()

const EMAIL = 'e2e-a11y@serenamia.test'
const PASSWORD = 'clave-e2e-12345'
const PHONE = '3816116666'
const SLUG = 'e2e-a11y-esmalte'
const NAME = 'E2E A11y Esmalte'
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

async function audit(page: Page, name: string) {
  // Las páginas hacen streaming: auditar solo cuando ya no queda ningún "Cargando…".
  await expect(page.getByText(/^Cargando/)).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    `axe en ${name}`,
  ).toEqual([])
}

test('páginas públicas sin violaciones WCAG A/AA a 390px', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('product-card').first()).toBeVisible()
  await audit(page, 'home')

  await page.goto(`/?q=${encodeURIComponent(NAME)}`)
  await page.getByRole('button', { name: `Agregar ${NAME}` }).click()
  await page.getByRole('button', { name: /Carrito/ }).click()
  await expect(page.getByRole('dialog', { name: 'Tu carrito' })).toBeVisible()
  await audit(page, 'drawer')
  await page.getByRole('dialog', { name: 'Tu carrito' }).getByRole('link', { name: 'Continuar con el pedido' }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  await audit(page, 'checkout')

  await page.getByLabel('Tu nombre').fill('Ana Pérez')
  await page.getByLabel('Tu teléfono').fill(PHONE)
  await page.getByLabel('Retiro en el local').check()
  await page.getByLabel('Transferencia').check()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido\/SM-/)
  await audit(page, 'pedido')
  const code = page.url().split('/').pop()!

  await page.goto('/seguimiento')
  await audit(page, 'seguimiento')
  await page.getByLabel('Número de pedido').fill(code)
  await page.getByLabel('Tu teléfono').fill(PHONE)
  await page.getByRole('button', { name: 'Ver mi pedido' }).click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  await audit(page, 'seguimiento-resultado')

  await page.goto('/mayoristas')
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  await audit(page, 'mayoristas')
})

test('login y panel admin sin violaciones WCAG A/AA a 390px', async ({ page }) => {
  await page.goto('/admin/login')
  await audit(page, 'admin-login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await audit(page, 'admin-inicio')

  await page.goto('/admin/pedidos')
  await audit(page, 'admin-pedidos')
  await page.getByTestId('admin-order').first().getByRole('link').click()
  await expect(page).toHaveURL(/\/admin\/pedidos\/\d+$/)
  await audit(page, 'admin-pedido-detalle')

  await page.goto('/admin/productos')
  await audit(page, 'admin-productos')
  await page.goto('/admin/productos/nuevo')
  await audit(page, 'admin-producto-nuevo')
  await page.goto('/admin/ajustes')
  await audit(page, 'admin-ajustes')
})
