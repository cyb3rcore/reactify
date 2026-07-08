import { resolve } from 'node:path'
import viteReact from '@vitejs/plugin-react'
import reactifyPlugin from 'reactify/plugin'
import rsc from '@vitejs/plugin-rsc'

export default {
  root: resolve(import.meta.dirname, 'client'),
  plugins: [
    viteReact(),
    reactifyPlugin(),
    rsc({
      entries: {
        rsc: '$app/rsc-entry.js',
      },
    }),
  ],
}
