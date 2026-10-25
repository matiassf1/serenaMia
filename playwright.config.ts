import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets parallel workers run their own dev server without colliding.
const port = process.env.E2E_PORT ?? '3000'

export default defineConfig({
  testDir: 'tests/e2e',
  // Los specs comparten una sola base (contador de pedidos nuevos, ajustes): sin paralelismo.
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
})
