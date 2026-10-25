import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { expect, test } from '@playwright/test'

config()

const EMAIL = 'e2e-admin@serenamia.test'
const PASSWORD = 'clave-e2e-12345'
const db = new PrismaClient()

test.beforeAll(async () => {
  await db.adminUser.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
    create: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  })
})

test.afterAll(async () => {
  await db.adminUser.deleteMany({ where: { email: EMAIL } })
  await db.$disconnect()
})

test('sin sesión, /admin redirige al login', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})

test('clave incorrecta muestra error y no entra', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill('incorrecta')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.locator('main [role=alert]')).toContainText('Email o contraseña incorrectos')
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('login correcto muestra navegación inferior en móvil; cerrar sesión vuelve al login', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/admin$/)

  const nav = page.getByRole('navigation', { name: 'Panel' })
  await expect(nav).toBeVisible()
  for (const label of ['Pedidos', 'Productos', 'Ajustes']) {
    const link = nav.getByRole('link', { name: label })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  const viewport = page.viewportSize()!
  const navBox = (await nav.boundingBox())!
  expect(navBox.y + navBox.height).toBeGreaterThan(viewport.height - 2)

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
})
