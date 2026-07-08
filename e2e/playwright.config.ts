import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: ['e2e/*/e2e.test.ts'],
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    headless: true,
  },
})
