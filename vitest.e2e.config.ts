import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const resolveMock = (name: string) =>
  resolve(__dirname, 'src/__mocks__', name)

export default defineConfig({
  test: {
    include: ['e2e/*/server.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@vitejs/plugin-rsc/rsc': resolveMock('plugin-rsc-rsc.ts'),
      '@vitejs/plugin-rsc/ssr': resolveMock('plugin-rsc-ssr.ts'),
      '@vitejs/plugin-rsc/browser': resolveMock('plugin-rsc-browser.ts'),
    },
  },
})
