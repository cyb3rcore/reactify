import type { Plugin, ResolvedConfig } from 'vite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import viteFastify from '../../vite/plugin.js'
import rsc from '@vitejs/plugin-rsc'
import {
  prefix,
  resolveId,
  loadSource,
  loadVirtualModule,
  createPlaceholderExports,
} from './virtual.js'
import { closeBundle } from './preload.js'

// Resolve @vitejs/plugin-rsc path for subpath imports
// Needed for Rolldown to resolve bare specifiers from virtual modules
// which have no physical file path for resolution.
let rscPkgResolved: string | undefined
let rscRequire: ReturnType<typeof createRequire> | undefined
try {
  rscRequire = createRequire(import.meta.url)
  rscPkgResolved = rscRequire.resolve('@vitejs/plugin-rsc').replace(/\\/g, '/')
  rscPkgResolved = rscPkgResolved.replace(/\/dist\/index\.js$/, '')
} catch {
  // Not available — will be handled by fallback resolution
}

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
    ...rsc({ serverHandler: false }),
    {
      name: 'vite-plugin-reactify',
      config(rawConfig: Record<string, unknown>, ctx: { command: string }) {
        return config.call({ ts: options.ts ?? false }, rawConfig, ctx)
      },
      configResolved: configResolved.bind(context),
      resolveId(id: string, importer?: string) {
        // Resolve @vitejs/plugin-rsc/ subpath imports from virtual modules
        // (e.g. @vitejs/plugin-rsc/rsc, @vitejs/plugin-rsc/browser).
        // Virtual modules have no physical file path, so Vite's standard
        // resolution can't find these bare specifiers.
        if (rscRequire && id.startsWith('@vitejs/plugin-rsc/') && !id.includes('/vendor/')) {
          try {
            return { id: rscRequire.resolve(id) }
          } catch {
            // Fall through to the standard resolveId
          }
        }
        // Don't strip \0 prefix here — let virtual module IDs pass through
        // to the load hook where the \0 prefix is stripped. Resolving them
        // here would cause Rolldown to attempt file-system lookup.
        return resolveId.call(context, id, importer)
      },
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
  // Strip Vite's \0 virtual module prefix before matching $app prefix
  const virtualId = id.charCodeAt(0) === 0 ? id.slice(1) : id
  if (prefix.test(virtualId)) {
    const [, virtual] = virtualId.split(prefix)
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
  this: { ts?: boolean },
  rawConfig: Record<string, unknown>,
  { command }: { command: string },
): void {
  if (!rawConfig.environments) {
    rawConfig.environments = {}
  }
  const environments = rawConfig.environments as Record<string, unknown>

  // Resolve @vitejs/plugin-rsc aliases so Rolldown can find bare specifiers
  // from virtual modules (which have no physical file path for resolution base).
  const rscPkgAlias = rscPkgResolved
    ? { find: '@vitejs/plugin-rsc', replacement: rscPkgResolved + '/dist' }
    : null
  const resolveAliases = [rscPkgAlias].filter(Boolean)

  // The RSC environment is needed in both dev and build modes.
  const existingRsc = (environments.rsc ?? {}) as Record<string, unknown>
  const outDir = ((rawConfig.build as Record<string, unknown>)?.outDir as string) ?? 'dist'

  environments.rsc = {
    ...existingRsc,
    keepProcessEnv: false,
    build: {
      ...((existingRsc.build ?? {}) as Record<string, unknown>),
      outDir: `${outDir}/rsc`,
      rolldownOptions: undefined,
      rollupOptions: {
        ...(((existingRsc.build as Record<string, unknown>)?.rollupOptions ?? {}) as Record<string, unknown>),
        input: {
          'rsc-entry': '$app/rsc-entry.js',
        },
      },
    },
    resolve: {
      ...((existingRsc.resolve ?? {}) as Record<string, unknown>),
      alias: resolveAliases,
    },
    optimizeDeps: {
      ...((existingRsc.optimizeDeps ?? {}) as Record<string, unknown>),
      exclude: [
        ...((existingRsc.optimizeDeps as Record<string, unknown> | undefined)?.exclude as string[] ?? []),
        '$app/*',
        '@vitejs/plugin-rsc/rsc',
        '@vitejs/plugin-rsc/ssr',
        '@vitejs/plugin-rsc/browser',
      ],
    },
    esbuild: {
      ...((existingRsc.esbuild ?? {}) as Record<string, unknown>),
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
  }

  // Prevent duplicate React copies. @vitejs/plugin-rsc forces react and
  // react-dom into the SSR environment's noExternal (build) and
  // optimizeDeps.include (dev). Bundling React into the SSR bundle creates
  // a second copy whose hooks dispatcher is null — causing "Invalid hook call".
  const ssrEnv = environments.ssr as Record<string, unknown> | undefined
  if (ssrEnv) {
    // Build: externalize React so the SSR bundle imports from host
    const ssrResolve = (ssrEnv.resolve ?? {}) as Record<string, unknown>
    const noExternal = ssrResolve.noExternal
    if (noExternal && Array.isArray(noExternal)) {
      ssrResolve.noExternal = noExternal.filter(
        (pkg: string) => pkg !== 'react' && pkg !== 'react-dom',
      )
    }

    // Dev: don't pre-bundle React so Vite's SSR module runner resolves
    // to the same node_modules copy as the host server
    const ssrOptimizeDeps = (ssrEnv.optimizeDeps ?? {}) as Record<string, unknown>
    const depsInclude = ssrOptimizeDeps.include
    if (depsInclude && Array.isArray(depsInclude)) {
      ssrOptimizeDeps.include = depsInclude.filter(
        (pkg: string) =>
          pkg !== 'react' &&
          pkg !== 'react-dom' &&
          !pkg.startsWith('react/') &&
          !pkg.startsWith('react-dom/'),
      )
    }
  }

  // Also clean up the RSC environment's optimizeDeps.include — same reason
  const rscOptimizeDeps = (environments.rsc as Record<string, unknown>)?.optimizeDeps as Record<string, unknown> | undefined
  if (rscOptimizeDeps?.include && Array.isArray(rscOptimizeDeps.include)) {
    rscOptimizeDeps.include = (rscOptimizeDeps.include as string[]).filter(
      (pkg: string) =>
        pkg !== 'react' &&
        pkg !== 'react-dom' &&
        !pkg.startsWith('react/') &&
        !pkg.startsWith('react-dom/'),
    )
  }

  // Also ensure @vitejs/plugin-rsc is resolvable in the client build.
  // Virtual modules ($app/rsc-content.jsx) import from @vitejs/plugin-rsc/browser
  // and need this alias since they have no physical filesystem path for resolution.
  if (rscPkgResolved) {
    const clientEnv = (environments.client ?? {}) as Record<string, unknown>
    const clientResolve = (clientEnv.resolve ?? {}) as Record<string, unknown>
    const clientAliases = (clientResolve.alias ?? []) as Array<Record<string, unknown>>
    if (!clientAliases.some((a) => a.find === '@vitejs/plugin-rsc')) {
      clientEnv.resolve = {
        ...clientResolve,
        alias: [...clientAliases, rscPkgAlias],
      }
    }
    // Also set at the top level for Vite's optimizer
    const topAliases = ((rawConfig.resolve as Record<string, unknown>)?.alias ?? []) as Array<Record<string, unknown>>
    if (!topAliases.some((a) => a.find === '@vitejs/plugin-rsc')) {
      rawConfig.resolve = {
        ...(rawConfig.resolve as Record<string, unknown>),
        alias: [...topAliases, rscPkgAlias],
      }
    }
  }

  if (command === 'build') {
    if (!rawConfig.build) rawConfig.build = {}
    const buildConfig = rawConfig.build as Record<string, unknown>
    if (!buildConfig.rollupOptions) {
      buildConfig.rollupOptions = {}
    }
    ;(buildConfig.rollupOptions as Record<string, unknown>).onwarn = onwarn
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
