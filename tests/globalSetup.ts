import { execSync } from 'node:child_process'
import { config } from 'dotenv'

config()

export default function setup() {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST no está definida (ver .env.example)')
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}
