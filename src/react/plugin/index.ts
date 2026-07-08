import type { Plugin, ResolvedConfig } from 'vite'
import viteFastify from '../../vite/plugin'
import {
  prefix,
  resolveId,
  loadSource,
  loadVirtualModule,
  createPlaceholderExports,
} from './virtual'
import { closeBundle } from './preload'

interface PluginContext {
  root: string | null
  environment: { name: string; config: ResolvedConfig }
  resolvedConfig?: ResolvedConfig
  resolvedBundle?: unknown
  indexHtml?: string
}

export default function viteReactifyPlugin(
  options: { ts?: boolean } = {},
): Plugin[] {
  const context: PluginContext = {
    root: null,
    environment: { name: '', config: {} as ResolvedConfig },
  }

  return [
    viteFastify({
      clientModule: options.ts ? '$app/index.ts' : '$app/index.js',
    }) as Plugin,
    {
      name: 'vite-plugin-reactify',
      config,
      configResolved: configResolved.bind(context),
      resolveId: resolveId.bind(context),
      load: load.bind(context),
      transformIndexHtml: {
        order: 'post' as const,
        handler: transformIndexHtml.bind(context),
      },
      closeBundle: closeBundle.bind(context),
    } as unknown as Plugin,
  ]
}

async function load(
  this: PluginContext,
  id: string,
): Promise<string | { code: string; map: null } | undefined> {
  if (id.includes('?server') && !this.environment.config.build?.ssr) {
    const source = loadSource(id)
    return createPlaceholderExports(source)
  }
  if (id.includes('?client') && this.environment.config.build?.ssr) {
    const source = loadSource(id)
    return createPlaceholderExports(source)
  }
  if (prefix.test(id)) {
    const [, virtual] = id.split(prefix)
    if (virtual) return loadVirtualModule(virtual)
  }
}

function transformIndexHtml(
  this: PluginContext,
  _html: string,
  ctx: { bundle?: unknown },
): void {
  if (!ctx.bundle) return
  this.indexHtml = _html
  this.resolvedBundle = ctx.bundle
}

function configResolved(this: PluginContext, config: ResolvedConfig): void {
  this.resolvedConfig = config
  this.root = config.root
}

function config(
  config: Record<string, unknown>,
  { command }: { command: string },
): void {
  if (command === 'build') {
    if (!config.build) config.build = {}
    if (!(config.build as Record<string, unknown>).rollupOptions) {
      (config.build as Record<string, unknown>).rollupOptions = {}
    }
    ;(config.build as Record<string, unknown>).rollupOptions = {
      ...((config.build as Record<string, unknown>).rollupOptions as Record<string, unknown>),
      onwarn,
    }
  }
}

function onwarn(
  warning: { code?: string; message?: { includes?: (s: string) => boolean }; exporter?: string },
  rollupWarn: (warning: { code?: string; message?: { includes?: (s: string) => boolean }; exporter?: string }) => void,
): void {
  if (
    !(
      warning.code === 'PLUGIN_WARNING' &&
      warning.message?.includes?.('dynamic import will not move module into another chunk')
    ) &&
    !(warning.code === 'UNUSED_EXTERNAL_IMPORT' && warning.exporter === 'vue')
  ) {
    rollupWarn(warning)
  }
}
