import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

const ADDRESS = 'Isabel la Católica 641, San Miguel de Tucumán'

// Idempotente: todo con upsert / claves naturales, se puede correr N veces.
export async function seed(db: PrismaClient) {
  await db.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Serena Mia',
      tagline: 'Estética & Insumos',
      address: ADDRESS,
      whatsapp: '+54 9 381 611-6380',
      instagram: 'https://www.instagram.com/serenamiaest/',
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`,
      wholesaleBanner: 'Precios mayoristas para salones: consultá las cantidades mínimas en cada producto.',
      pendingExpiryHours: 48,
    },
  })

  // lun–vie 10:30–20:00, sáb 10:00–14:00, domingo cerrado (sin filas).
  const hours = [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: '10:30', closesAt: '20:00' })),
    { weekday: 6, opensAt: '10:00', closesAt: '14:00' },
  ]
  for (const h of hours) {
    await db.businessHours.upsert({
      where: { weekday_opensAt: { weekday: h.weekday, opensAt: h.opensAt } },
      update: { closesAt: h.closesAt },
      create: h,
    })
  }

  const insumos = await db.category.upsert({
    where: { slug: 'insumos' },
    update: {},
    create: { name: 'Insumos', slug: 'insumos', sortOrder: 1 },
  })
  const cosmetologia = await db.category.upsert({
    where: { slug: 'cosmetologia' },
    update: {},
    create: { name: 'Cosmetología', slug: 'cosmetologia', sortOrder: 2 },
  })

  // Productos claramente ficticios. Precios en centavos.
  const products = [
    { n: 1, cat: insumos.id, retail: 450000, wholesale: 380000, min: 6, stock: 40 },
    { n: 2, cat: insumos.id, retail: 320000, wholesale: null, min: null, stock: 25 },
    { n: 3, cat: insumos.id, retail: 215000, wholesale: 180000, min: 10, stock: 60 },
    { n: 4, cat: cosmetologia.id, retail: 890000, wholesale: 750000, min: 3, stock: 15 },
    { n: 5, cat: cosmetologia.id, retail: 1250000, wholesale: null, min: null, stock: 8 },
    { n: 6, cat: cosmetologia.id, retail: 640000, wholesale: 540000, min: 5, stock: 20 },
  ]
  // SEED_SKIP_SAMPLES=1 (producción): solo datos del local, sin productos de ejemplo.
  const prod = process.env.SEED_SKIP_SAMPLES === '1'
  for (const p of prod ? [] : products) {
    const slug = `producto-de-ejemplo-${p.n}`
    await db.product.upsert({
      where: { slug },
      update: {},
      create: {
        name: `Producto de ejemplo ${p.n}`,
        slug,
        description: 'Producto de ejemplo para desarrollo. Reemplazar por el catálogo real.',
        categoryId: p.cat,
        retailPrice: p.retail,
        wholesalePrice: p.wholesale,
        wholesaleMinQty: p.min,
        stock: p.stock,
        active: true,
      },
    })
  }

  await db.paymentMethod.upsert({
    where: { name: 'Transferencia' },
    update: {},
    create: {
      name: 'Transferencia',
      instructions: 'Alias: SERENA.MIA.EJEMPLO — Titular: (completar en el panel). Enviá el comprobante por WhatsApp.',
      sortOrder: 1,
      // En producción queda desactivada hasta que Elías cargue su alias real: nunca mostrar un alias de ejemplo a clientas.
      active: !prod,
    },
  })
  await db.paymentMethod.upsert({
    where: { name: 'Efectivo' },
    update: {},
    create: { name: 'Efectivo', instructions: 'Pagás al retirar o al recibir tu pedido.', sortOrder: 2 },
  })

  await db.pickupPoint.upsert({
    where: { name: 'Local Serena Mia' },
    update: {},
    create: { name: 'Local Serena Mia', address: ADDRESS },
  })
  // Sin zonas activas el checkout no ofrece envío; en producción Elías define sus zonas y costos reales.
  if (!prod) {
    await db.shippingZone.upsert({
      where: { name: 'San Miguel de Tucumán (zona de ejemplo)' },
      update: {},
      create: { name: 'San Miguel de Tucumán (zona de ejemplo)', cost: 300000 },
    })
  }
}

// Crea el primer admin desde ADMIN_EMAIL / ADMIN_PASSWORD solo si todavía no existe ninguno (arranque de producción).
export async function ensureFirstAdmin(db: PrismaClient) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password || (await db.adminUser.count()) > 0) return
  if (password.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres')
  const { hashPassword } = await import('../src/lib/auth')
  await db.adminUser.create({ data: { email, passwordHash: await hashPassword(password) } })
  console.log(`Primer admin creado: ${email}`)
}

// Solo corre al ejecutarse directamente (tsx prisma/seed.ts), no al importarlo desde tests.
if (process.argv[1]?.endsWith('seed.ts') && !process.env.VITEST) {
  config()
  const db = new PrismaClient()
  seed(db)
    .then(() => ensureFirstAdmin(db))
    .then(() => console.log('Seed OK'))
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
