import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@vitejs/plugin-rsc/rsc': resolve(__dirname, 'src/__mocks__/plugin-rsc-rsc.ts'),
      '@vitejs/plugin-rsc/ssr': resolve(__dirname, 'src/__mocks__/plugin-rsc-ssr.ts'),
      '@vitejs/plugin-rsc/browser': resolve(__dirname, 'src/__mocks__/plugin-rsc-browser.ts'),
      $app: resolve(__dirname, 'src/react/virtual'),
      '#runtime': resolve(__dirname, 'src/react'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
