import { test, expect, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const CODE = 'Salon-Test-12'
const SLUGS = ['e2e-wholesale-a', 'e2e-wholesale-b']
const A = 'E2E Lote Uno'
const B = 'E2E Lote Dos'
const SHOTS = process.env.E2E_SHOTS_DIR

test.describe.configure({ mode: 'serial' })

let original: { wholesaleMode: 'PUBLIC' | 'CODE'; wholesaleCode: string | null }

async function setMode(wholesaleMode: 'PUBLIC' | 'CODE', wholesaleCode: string | null = CODE) {
  await db.storeSettings.update({ where: { id: 1 }, data: { wholesaleMode, wholesaleCode } })
}

async function cleanup() {
  await db.product.deleteMany({ where: { slug: { in: SLUGS } } })
}

test.beforeAll(async () => {
  const s = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: { wholesaleMode: true, wholesaleCode: true } })
  original = s
  await cleanup()
  const category = await db.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
  await db.product.create({
    data: { slug: SLUGS[0], name: A, categoryId: category.id, retailPrice: 100000, wholesalePrice: 70000, wholesaleMinQty: 3, stock: 40 },
  })
  await db.product.create({ data: { slug: SLUGS[1], name: B, categoryId: category.id, retailPrice: 50000, stock: 10 } })
})

test.afterAll(async () => {
  await cleanup()
  await db.storeSettings.update({ where: { id: 1 }, data: original })
  await db.$disconnect()
})

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

const card = (page: Page, name: string) => page.getByTestId('product-card').filter({ hasText: name })

test.describe('celular (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('modo CODE sin código: no se ve ningún precio mayorista y hay una entrada discreta', async ({ page }) => {
    await setMode('CODE')
    await page.goto(`/?q=${encodeURIComponent(A)}`)
    await expect(card(page, A)).toContainText('1.000')
    await expect(card(page, A)).not.toContainText('Mayorista')
    await expect(page.getByText('700', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tengo un código mayorista' })).toBeVisible()
    await shot(page, 'wholesale-390-locked')

    await page.goto('/mayoristas')
    await expect(page.getByTestId('wholesale-table')).toHaveCount(0)
    await expect(page.getByTestId('wholesale-list')).toHaveCount(0)
    await expect(page.getByLabel('Código mayorista')).toBeVisible()
  })

  test('código incorrecto da un mensaje claro; el correcto muestra el precio mayorista', async ({ page }) => {
    await setMode('CODE')
    await page.goto(`/?q=${encodeURIComponent(A)}`)
    await page.getByRole('button', { name: 'Tengo un código mayorista' }).click()
    await page.getByLabel('Código mayorista').fill('equivocado')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Ese código no es correcto')).toBeVisible()
    await expect(card(page, A)).not.toContainText('Mayorista')

    await page.getByLabel('Código mayorista').fill(CODE)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(card(page, A)).toContainText(/Mayorista \$\s700 desde 3 u\./)
    await expect(page.getByText('Precios mayoristas activados')).toBeVisible()
    await shot(page, 'wholesale-390-unlocked')
  })

  test('el carrito pasa a precio mayorista al llegar al mínimo y el pedido cobra lo mismo', async ({ page }) => {
    await setMode('CODE')
    await page.goto(`/?q=${encodeURIComponent(A)}`)
    await page.getByRole('button', { name: 'Tengo un código mayorista' }).click()
    await page.getByLabel('Código mayorista').fill(CODE)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(card(page, A)).toContainText('desde 3 u.')

    const add = page.getByRole('button', { name: `Agregar ${A}` })
    await add.click()
    await add.click()
    await expect(card(page, A)).toContainText('1.000')
    await add.click()
    await expect(card(page, A)).toContainText('Precio mayorista aplicado')
    await expect(card(page, A)).toContainText('700')

    await page.getByRole('button', { name: /Carrito/ }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toContainText('precio mayorista')
    await expect(drawer).toContainText('Total: $ 2.100')
    await drawer.getByRole('link', { name: 'Continuar con el pedido' }).click()
    await expect(page.getByText('Subtotal: $ 2.100')).toBeVisible()
    await shot(page, 'wholesale-390-checkout')
  })

  test('si Elías cambia el código, la cookie vieja deja de valer', async ({ page }) => {
    await setMode('CODE')
    await page.goto(`/?q=${encodeURIComponent(A)}`)
    await page.getByRole('button', { name: 'Tengo un código mayorista' }).click()
    await page.getByLabel('Código mayorista').fill(CODE)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(card(page, A)).toContainText('desde 3 u.')

    await setMode('CODE', 'Codigo-Nuevo-99')
    await page.reload()
    await expect(card(page, A)).not.toContainText('Mayorista')
    await expect(page.getByRole('button', { name: 'Tengo un código mayorista' })).toBeVisible()
  })

  test('modo PUBLIC: lista simple en el celular, sin tabla', async ({ page }) => {
    await setMode('PUBLIC', null)
    await page.goto('/mayoristas')
    await expect(page.getByTestId('wholesale-list')).toBeVisible()
    await expect(page.getByTestId('wholesale-table')).toBeHidden()
    await expect(page.getByTestId('wholesale-list')).toContainText(A)
    await expect(page.getByTestId('wholesale-list')).toContainText('desde 3 u.')
    await expect(page.getByRole('button', { name: 'Tengo un código mayorista' })).toHaveCount(0)
    await shot(page, 'wholesale-390-list')
  })
})

test.describe('PC (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })

  test('tabla densa con las 6 columnas; se agrega por cantidad y el carrito aplica el mayorista', async ({ page }) => {
    await setMode('PUBLIC', null)
    await page.goto('/mayoristas')
    const table = page.getByTestId('wholesale-table')
    await expect(table).toBeVisible()
    await expect(page.getByTestId('wholesale-list')).toBeHidden()
    for (const h of ['Producto', 'Stock', 'Minorista', 'Mayorista', 'Mínimo', 'Cantidad']) {
      await expect(table.getByRole('columnheader', { name: h })).toBeVisible()
    }
    const row = table.getByTestId('wholesale-row').filter({ hasText: A })
    await expect(row).toContainText('40')
    await expect(row).toContainText('1.000')
    await expect(row).toContainText('700')
    await expect(row).toContainText('3 u.')
    // Producto sin mayorista: guiones en lugar de precio y mínimo.
    await expect(table.getByTestId('wholesale-row').filter({ hasText: B }).getByLabel('sin precio mayorista')).toHaveCount(2)

    const qty = row.getByLabel(`Cantidad de ${A}`)
    await expect(qty).toHaveValue('3')
    await qty.fill('2')
    await expect(row).toContainText('$ 1.000 c/u')
    await qty.fill('10')
    await expect(row).toContainText('$ 700 c/u · mayorista')
    await shot(page, 'wholesale-1280-table')
    await row.getByRole('button', { name: `Agregar ${A} al carrito` }).click()

    await page.getByRole('button', { name: /Carrito/ }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toContainText('precio mayorista')
    await expect(drawer).toContainText('Total: $ 7.000')
  })
})
