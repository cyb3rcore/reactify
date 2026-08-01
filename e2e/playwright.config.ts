import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: ['e2e/*/e2e.test.ts'],
  workers: 1,
  // One retry absorbs a known Vite 8 dev-server flake: the module runner's
  // transport can transiently disconnect while in-flight fetchModule RPCs
  // are being rejected during the watcher storm triggered by the HMR tests
  // editing fixture pages ("transport was disconnected, cannot call
  // fetchModule" from createRoutes). The retried test re-runs beforeAll,
  // booting a fresh dev server, so the broken runner is not reused.
  retries: 1,
  timeout: 30000,
  use: {
    headless: true,
  },
})
