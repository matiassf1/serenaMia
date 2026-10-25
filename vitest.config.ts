import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import path from 'node:path'

config()

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/service/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    // Los tests de servicio comparten una sola base: sin paralelismo entre archivos.
    fileParallelism: false,
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' },
  },
})
