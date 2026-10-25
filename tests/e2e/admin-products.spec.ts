import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { expect, test, type Page } from '@playwright/test'

config()

const EMAIL = 'e2e-products@serenamia.test'
const PASSWORD = 'clave-e2e-12345'
const STAMP = Date.now()
const CATEGORY = `E2E Cat ${STAMP}`
const NAME = `Esmalte E2E ${STAMP}`
const db = new PrismaClient()
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

test.beforeAll(async () => {
  await db.adminUser.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
    create: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  })
  await db.category.create({ data: { name: CATEGORY, slug: `e2e-cat-${STAMP}`, sortOrder: 999 } })
})

test.afterAll(async () => {
  const products = await db.product.findMany({ where: { category: { name: CATEGORY } }, select: { id: true } })
  const ids = products.map((p) => p.id)
  await db.stockLog.deleteMany({ where: { productId: { in: ids } } })
  await db.auditLog.deleteMany({
    where: { entity: 'Product', entityId: { in: ids.map(String) } },
  })
  await db.product.deleteMany({ where: { id: { in: ids } } })
  await db.category.deleteMany({ where: { name: CATEGORY } })
  await db.adminUser.deleteMany({ where: { email: EMAIL } })
  await db.$disconnect()
})

test('crear con foto, ver alerta de stock bajo, dejar sin stock y verlo en el sitio público', async ({ page }) => {
  await login(page)
  await page.goto('/admin/productos')
  await page.getByRole('link', { name: '+ Nuevo producto' }).click()
  await expect(page).toHaveURL(/\/admin\/productos\/nuevo$/)

  await page.getByLabel('Nombre', { exact: true }).fill(NAME)
  await page.getByLabel('Categoría').selectOption({ label: CATEGORY })
  await page.getByLabel('Precio', { exact: true }).fill('1.500,00')
  await page.getByLabel('Cantidad disponible (stock)').fill('2')
  await page.getByLabel(/^Foto/).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/\/admin\/productos$/)

  // Búsqueda + alerta de stock bajo en el listado.
  await page.getByRole('searchbox', { name: 'Buscar producto' }).fill(NAME)
  await page.getByRole('button', { name: 'Buscar' }).click()
  const card = page.getByTestId('admin-product').filter({ hasText: NAME })
  await expect(card).toHaveCount(1)
  await expect(card.getByTestId('low-stock-badge')).toBeVisible()
  await expect(page.getByTestId('low-stock-alert')).toBeVisible()
  await expect(card).toContainText('1.500,00')

  // Targets táctiles ≥ 44 px en las acciones de la tarjeta.
  const targets = [
    page.getByRole('button', { name: `Restar 1 a ${NAME}` }),
    page.getByRole('button', { name: `Sumar 1 a ${NAME}` }),
    page.getByRole('button', { name: `Marcar ${NAME} sin stock` }),
    page.getByRole('link', { name: `Editar ${NAME}` }),
  ]
  for (const [i, target] of targets.entries()) {
    const name = String(i)
    const box = await target.boundingBox()
    expect(box!.height, name).toBeGreaterThanOrEqual(44)
    expect(box!.width, name).toBeGreaterThanOrEqual(44)
  }

  // +1 / −1 rápidos.
  await card.getByRole('button', { name: `Sumar 1 a ${NAME}` }).click()
  await expect(card.locator('[aria-live=polite]')).toHaveText('3')
  await card.getByRole('button', { name: `Restar 1 a ${NAME}` }).click()
  await expect(card.locator('[aria-live=polite]')).toHaveText('2')

  // "Sin stock" pide confirmación.
  await card.getByRole('button', { name: `Marcar ${NAME} sin stock` }).click()
  await card.getByRole('button', { name: 'No' }).click()
  await expect(card.locator('[aria-live=polite]')).toHaveText('2')
  await card.getByRole('button', { name: `Marcar ${NAME} sin stock` }).click()
  await card.getByRole('button', { name: 'Sí, sin stock' }).click()
  await expect(card.locator('[aria-live=polite]')).toHaveText('0')
  await expect(card.getByText('Sin stock', { exact: true })).toBeVisible()

  // Público: se ve "Sin stock" y la foto sale de /api/uploads.
  await page.goto(`/?q=${encodeURIComponent(NAME)}`)
  const pub = page.getByTestId('product-card').filter({ hasText: NAME })
  await expect(pub).toHaveCount(1)
  await expect(pub.getByText('Sin stock')).toBeVisible()
  const src = await pub.locator('img').first().getAttribute('src')
  expect(decodeURIComponent(src!)).toContain('/api/uploads/')

  // Cada cambio quedó auditado con el email del admin.
  const p = await db.product.findFirstOrThrow({ where: { name: NAME } })
  const audits = await db.auditLog.findMany({ where: { entity: 'Product', entityId: String(p.id) } })
  expect(audits.length).toBeGreaterThanOrEqual(3)
  expect(audits.every((a) => a.adminEmail === EMAIL)).toBe(true)
})

test('cambio de precios por porcentaje: vista previa antes de aplicar', async ({ page }) => {
  const cat = await db.category.findFirstOrThrow({ where: { name: CATEGORY } })
  const p = await db.product.upsert({
    where: { slug: `e2e-bulk-${STAMP}` },
    update: {},
    create: { name: `Bulk E2E ${STAMP}`, slug: `e2e-bulk-${STAMP}`, categoryId: cat.id, retailPrice: 100000, stock: 10 },
  })
  await login(page)
  await page.goto(`/admin/productos?q=${encodeURIComponent(`Bulk E2E ${STAMP}`)}`)
  await page.getByRole('button', { name: 'Cambiar precios por porcentaje' }).click()
  await page.getByLabel('Categoría').selectOption({ label: CATEGORY })
  await page.getByLabel(/^Porcentaje/).fill('10')
  await page.getByRole('button', { name: 'Ver cómo quedan' }).click()

  const preview = page.getByTestId('bulk-preview')
  await expect(preview).toContainText(`Bulk E2E ${STAMP}`)
  await expect(preview).toContainText('1.000,00')
  await expect(preview).toContainText('1.100,00')
  expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).retailPrice).toBe(100000) // todavía no se aplicó

  await page.getByRole('button', { name: /^Aplicar a/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Listo' })).toBeVisible()
  expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).retailPrice).toBe(110000)
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'product.price.bulk', entityId: String(p.id) } })
  expect(audit.adminEmail).toBe(EMAIL)
})

test('formulario inválido muestra el error en español y no guarda', async ({ page }) => {
  await login(page)
  await page.goto('/admin/productos/nuevo')
  await page.getByLabel('Nombre', { exact: true }).fill(`Invalido ${STAMP}`)
  await page.getByLabel('Categoría').selectOption({ label: CATEGORY })
  await page.getByLabel('Precio', { exact: true }).fill('1.500,00')
  await page.getByLabel('Precio mayorista', { exact: true }).fill('1.000,00')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page.locator('main [role=alert]')).toContainText('cantidad mínima')
  expect(await db.product.count({ where: { name: `Invalido ${STAMP}` } })).toBe(0)
})
