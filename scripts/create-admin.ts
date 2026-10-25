import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'

config()

async function main() {
  const [emailArg, password] = process.argv.slice(2)
  if (!emailArg || !password) {
    console.error('Uso: npm run admin:create -- <email> <contraseña>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.')
    process.exit(1)
  }
  const email = emailArg.trim().toLowerCase()
  const db = new PrismaClient()
  try {
    const passwordHash = await hashPassword(password)
    await db.adminUser.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    })
    console.log(`Admin listo: ${email}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
