import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { expect, test } from '@playwright/test'

config()

const EMAIL = 'e2e-smoke@serenamia.test'
const PASSWORD = 'clave-e2e-12345'
const PHONE_TYPED = '381 611-5555' // formato distinto al que se usa después
const PHONE_TRACK = '3816115555'
const SLUG = 'e2e-smoke-esmalte'
const NAME = 'E2E Humo Esmalte'
const db = new PrismaClient()

test.use({ viewport: { width: 390, height: 844 } })

async function cleanup() {
  const products = await db.product.findMany({ where: { slug: SLUG }, select: { id: true } })
  const ids = products.map((p) => p.id)
  await db.order.deleteMany({ where: { OR: [{ phone: PHONE_TRACK }, { items: { some: { productId: { in: ids } } } }] } })
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

test('recorrido completo: pedido de la clienta, gestión de Elías y seguimiento', async ({ page, browser }) => {
  // 1. La home muestra los datos del local.
  const settings = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: settings.name })).toBeVisible()
  await expect(page.getByText(settings.address)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cómo llegar' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(/Abierto|Cerrado|Abre|Cierra/)

  // 2. Agrega un producto.
  await page.goto(`/?q=${encodeURIComponent(NAME)}`)
  await page.getByRole('button', { name: `Agregar ${NAME}` }).click()
  await page.getByRole('button', { name: /Carrito/ }).click()
  await page.getByRole('dialog', { name: 'Tu carrito' }).getByRole('link', { name: 'Continuar con el pedido' }).click()

  // 3. Checkout: retiro + efectivo.
  await expect(page).toHaveURL(/\/checkout$/)
  await page.getByLabel('Tu nombre').fill('Ana Pérez')
  await page.getByLabel('Tu teléfono').fill(PHONE_TYPED)
  await page.getByLabel('Retiro en el local').check()
  await page.getByLabel('Efectivo').check()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  // 4. Ve su código.
  await expect(page).toHaveURL(/\/pedido\/SM-[2-9A-HJKMNP-Z]{6}$/)
  const code = page.url().split('/').pop()!
  await expect(page.getByRole('heading', { name: code })).toBeVisible()

  // 5. Seguimiento con el teléfono en otro formato: "Recibido".
  await page.goto('/seguimiento')
  await page.getByLabel('Número de pedido').fill(code.toLowerCase())
  await page.getByLabel('Tu teléfono').fill('+54 9 381 611 5555')
  await page.getByRole('button', { name: 'Ver mi pedido' }).click()
  await expect(page.getByRole('heading', { name: code })).toBeVisible()
  const steps = page.getByTestId('timeline').getByRole('listitem')
  await expect(steps.nth(0)).toHaveText(/Recibido/)
  await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step')

  // 6. Elías entra al panel: el pedido aparece como nuevo.
  const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await admin.goto('/admin/login')
  await admin.getByLabel('Email').fill(EMAIL)
  await admin.getByLabel('Contraseña').fill(PASSWORD)
  await admin.getByRole('button', { name: 'Ingresar' }).click()
  await expect(admin).toHaveURL(/\/admin$/)
  await admin.goto('/admin/pedidos')
  const card = admin.getByTestId('admin-order').filter({ hasText: code })
  await expect(card.getByTestId('new-badge')).toBeVisible()

  // 7. Lo marca pagado y Listo.
  await card.getByRole('link').click()
  await admin.getByRole('button', { name: 'Marcar pagado' }).click()
  await expect(admin.getByText('Pagado', { exact: true }).locator('visible=true')).toBeVisible()
  await admin.getByRole('button', { name: 'Pasar a Preparando' }).click()
  await expect(admin.getByText('Preparando', { exact: true }).locator('visible=true')).toBeVisible()
  await admin.getByRole('button', { name: 'Pasar a Listo' }).click()
  await expect(admin.getByText('Listo', { exact: true }).locator('visible=true')).toBeVisible()
  await admin.context().close()

  // 8. La clienta ve "Listo" en el seguimiento.
  await page.goto('/seguimiento')
  await page.getByLabel('Número de pedido').fill(code)
  await page.getByLabel('Tu teléfono').fill(PHONE_TRACK)
  await page.getByRole('button', { name: 'Ver mi pedido' }).click()
  await expect(page.getByTestId('timeline').getByRole('listitem').nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('timeline')).toContainText('Listo')
})
