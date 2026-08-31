import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    reuseExistingServer: true,
    url: 'http://127.0.0.1:4173',
  },
})
