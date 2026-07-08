import { resolve } from 'node:path'

import viteReact from '@vitejs/plugin-react'
import viteReactify from 'reactify/plugin'

export default {
  root: resolve(import.meta.dirname, 'client'),
  plugins: [viteReact(), viteReactify()],
  ssr: {
    external: ['use-sync-external-store'],
  },
}
