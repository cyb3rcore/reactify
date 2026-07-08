import { resolve } from 'node:path'
import viteReact from '@vitejs/plugin-react'
import reactifyPlugin from 'reactify/plugin'

export default {
  root: resolve(import.meta.dirname, 'client'),
  plugins: [viteReact(), reactifyPlugin()],
}
