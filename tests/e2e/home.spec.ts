import { test, expect } from '@playwright/test'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const OUT_OF_STOCK = 'Producto sin stock (e2e)'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeAll(async () => {
  const category = await db.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
  await db.product.upsert({
    where: { slug: 'producto-sin-stock-e2e' },
    update: { stock: 0, active: true },
    create: {
      name: OUT_OF_STOCK, slug: 'producto-sin-stock-e2e', categoryId: category.id,
      retailPrice: 100000, stock: 0, active: true,
    },
  })
})

test.afterAll(async () => {
  await db.product.deleteMany({ where: { slug: 'producto-sin-stock-e2e' } })
  await db.$disconnect()
})

test('los datos del local se ven sin scrollear en celular', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Serena Mia', level: 1 })).toBeInViewport()
  await expect(page.getByText('Isabel la Católica 641')).toBeInViewport()
  await expect(page.getByText(/10:30/).first()).toBeInViewport()
  await expect(page.getByText(/^(Abierto|Cerrado)/).first()).toBeInViewport()
  await expect(page.getByRole('link', { name: 'Cómo llegar' })).toBeInViewport()
  await expect(page.getByRole('link', { name: 'WhatsApp', exact: true })).toBeInViewport()
})

test('botones del encabezado miden al menos 44px', async ({ page }) => {
  await page.goto('/')
  for (const name of ['Cómo llegar', 'WhatsApp']) {
    const box = await page.getByRole('link', { name, exact: true }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})

test('el catálogo muestra los productos seed y las categorías', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Producto de ejemplo 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Producto de ejemplo 6', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cosmetología' }).first()).toBeVisible()
})

test('la categoría filtra los productos', async ({ page }) => {
  await page.goto('/categoria/cosmetologia')
  await expect(page.getByText('Producto de ejemplo 4', { exact: true })).toBeVisible()
  await expect(page.getByText('Producto de ejemplo 1', { exact: true })).toHaveCount(0)
})

test('la búsqueda por ?q= filtra', async ({ page }) => {
  await page.goto('/?q=ejemplo 5')
  await expect(page.getByText('Producto de ejemplo 5', { exact: true })).toBeVisible()
  await expect(page.getByText('Producto de ejemplo 1', { exact: true })).toHaveCount(0)
  await page.goto('/?q=zzzz')
  await expect(page.getByText(/No encontramos productos/)).toBeVisible()
})

test('un producto sin stock muestra "Sin stock" y su botón está deshabilitado', async ({ page }) => {
  await page.goto('/?q=sin stock')
  const card = page.getByTestId('product-card').filter({ hasText: OUT_OF_STOCK })
  await expect(card.getByText('Sin stock', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: /Agregar/ })).toBeDisabled()
})

test('los botones Agregar con stock miden al menos 44px', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByTestId('product-card').first().getByRole('button', { name: /Agregar/ })
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

test('sin scroll horizontal a 390px', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
