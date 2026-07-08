import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['e2e/*/server.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
})
