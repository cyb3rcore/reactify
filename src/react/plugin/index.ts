import type { Plugin, ResolvedConfig } from 'vite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { transformWithOxc } from 'vite'
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

// Resolve rsc-html-stream path for Vite alias — needed because pnpm link:
// overrides don't hoist transitive dependencies. Without this alias, the
// dynamic import('rsc-html-stream/client') in mount.tsx fails to resolve.
let rscHtmlStreamResolved: string | undefined
try {
  if (rscRequire) {
    rscHtmlStreamResolved = rscRequire.resolve('rsc-html-stream/client').replace(/\\/g, '/')
    rscHtmlStreamResolved = rscHtmlStreamResolved.replace(/\/client\.js$/, '')
  }
} catch {
  // Not installed — will fail at runtime with a clear error
}

// Resolve devalue path for Vite alias — same reason as rsc-html-stream.
// Virtual modules ($app/ssr-entry.js) import devalue and need this alias
// since they have no physical filesystem path for resolution.
let devalueResolved: string | undefined
try {
  if (rscRequire) {
    devalueResolved = rscRequire.resolve('devalue').replace(/\\/g, '/')
    devalueResolved = devalueResolved.replace(/\/devalue\.cjs$/, '')
    devalueResolved = devalueResolved.replace(/\/index\.js$/, '')
    devalueResolved = devalueResolved.replace(/\/devalue\.mjs$/, '')
  }
} catch {
  // Not installed — will fail at runtime with a clear error
}

// Detect the reactify package name(s) so the plugin can exclude them from
// the client's dep optimizer. When the server-only subpath (@cyb3rcore
// /reactify/server with node:async_hooks) is imported from an RSC page
// component, Vite's optimizer pre-bundles the package and strips the
// try/catch guard around new AsyncLocalStorage() in rsc-context.ts,
// causing "AsyncLocalStorage is not a constructor" in the browser.
const reactifyPkgExcludes: string[] = []
// Collect the real package name via package.json
try {
  // The plugin is at src/react/plugin/index.ts; the package root is 3 levels up
  const pkgJson = resolve(import.meta.dirname, '..', '..', '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'))
  if (pkg.name) reactifyPkgExcludes.push(pkg.name)
} catch {
  // Fallback: use the known published name
  reactifyPkgExcludes.push('@cyb3rcore/reactify')
}
// Also detect local aliases (e.g. 'reactify' used in e2e fixtures) by
// checking if they resolve to the same location as this plugin
try {
  const reactifyRoot = resolve(import.meta.dirname, '..', '..', '..')
  for (const alias of ['reactify']) {
    try {
      if (
        rscRequire &&
        rscRequire.resolve(alias + '/package.json') === resolve(reactifyRoot, 'package.json')
      ) {
        reactifyPkgExcludes.push(alias)
      }
    } catch {
      /* not this alias */
    }
  }
} catch {
  /* skip alias detection */
}

// Resolve #runtime alias path used by virtual modules (e.g. #runtime/route-utils.js)
// Same as in the config hook's runtimeAlias definition.
const runtimeAliasPath = resolve(import.meta.dirname, '..')

interface PluginContext {
  root: string | null
  environment: { name: string; config: ResolvedConfig }
  resolvedConfig?: ResolvedConfig
  resolvedBundle?: unknown
  indexHtml?: string
}

export default function viteReactifyPlugin(options: { ts?: boolean } = {}): Plugin[] {
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
      configEnvironment(name: string, options: any) {
        // Filter react/react-dom from SSR resolve.noExternal — these must
        // always be provided by the consumer to avoid duplicate copies.
        // This runs AFTER all plugins' config hooks, so @vitejs/plugin-rsc's
        // additions are guaranteed to be present for us to clean up.
        //
        // NOTE: The RSC environment deliberately keeps react/react-dom in
        // noExternal so they are bundled at build time with the react-server
        // condition (set by @vitejs/plugin-rsc). Externalizing them means
        // Node.js resolves react without react-server at runtime, causing
        // React 19 to throw: "The react-server condition must be enabled".
        if (name === 'ssr') {
          const resolve = options.resolve
          if (resolve && Array.isArray(resolve.noExternal)) {
            const filtered = resolve.noExternal.filter(
              (pkg: string) => pkg !== 'react' && pkg !== 'react-dom',
            )
            if (filtered.length !== resolve.noExternal.length) {
              resolve.noExternal = filtered
            }
          }
        }
      },
      resolveId(id: string, importer?: string) {
        // === CLIENT ENVIRONMENT INTERCEPT ===
        //
        // ROOT CAUSE: dist/index.js uses `export ... from './vite/index.js'`
        // which creates a static ESM re-export chain:
        //   dist/index.js → dist/vite/index.js → dist/vite/config.js
        //     → dist/vite/config/paths.js → node:fs (crashes in browser)
        //
        // When a browser-side component imports ANY export from
        // @cyb3rcore/reactify (even just `Link`), Vite follows this chain
        // and tries to serve paths.js — whose `node:fs` import is externalized
        // for browser compatibility, causing the crash.
        //
        // Fix: for the client environment, intercept the package entry and
        // return a stub that only re-exports browser-safe modules.
        // Uses this.environment (provided by Vite 8's PluginContext) instead of
        // a closure variable — configEnvironment runs once per environment during
        // config and would leave a stale name for the wrong environment.
        if ((this as any).environment?.name === 'client') {
          if (id === '@cyb3rcore/reactify' || id === 'reactify') {
            return { id: '\0reactify:client-stub' }
          }
          // Safety net: prevent any vite config module from reaching the client
          if (
            id.includes('/dist/vite/config/') ||
            id.endsWith('/dist/vite/config.js') ||
            id.endsWith('/dist/vite/index.js') ||
            id.endsWith('/dist/vite/plugin.js')
          ) {
            return { id: '\0reactify:vite-config-stub' }
          }
        }

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
        // Resolve #runtime/* imports from virtual modules
        if (id.startsWith('#runtime/')) {
          return { id: id.replace('#runtime', runtimeAliasPath) }
        }
        // Don't strip \0 prefix here — let virtual module IDs pass through
        // to the load hook where the \0 prefix is stripped. Resolving them
        // here would cause Rolldown to attempt file-system lookup.
        return resolveId.call(context, id, importer)
      },
      load: load, // NOT bound — needs this.environment from Vite's PluginContext
      transform: {
        order: 'pre' as const,
        handler(code: string, id: string) {
          // Transform JSX in virtual modules before rsc:scan-strip runs,
          // since es-module-lexer (used by rsc:scan-strip) can't parse JSX.
          // The normalized module ID uses .js extension (from normalizeVirtualModuleId),
          // so we check includes('\0$app/') directly rather than file extension.
          if (
            id.includes('\0$app/') &&
            (id.endsWith('.jsx') || id.endsWith('.tsx') || id.endsWith('.js'))
          ) {
            return transformWithOxc(code, id, {
              jsx: { runtime: 'automatic', importSource: 'react' },
            })
          }
        },
      },
      transformIndexHtml: {
        order: 'post' as const,
        handler: transformIndexHtml.bind(context),
      },
      closeBundle: closeBundle.bind(context),
    } as unknown as Plugin,
  ]
}

/**
 * Inline shim for useActionState — replaces the React hook import in the RSC
 * environment where the react-server condition does not export this API.
 *
 * The react.react-server.js entry (used by the RSC build) omits useActionState.
 * Rather than fighting module resolution, we replace the import with an inline
 * function that returns [initialState, action]. This works because:
 * - On the server, useActionState just needs to provide the initial state and
 *   action reference; React SSR handles the progressive enhancement.
 * - The client-side hydration RscRoot / RscContent components use the real
 *   useActionState from the full react entry.
 */
const USE_ACTION_STATE_RE = /import\s*\{[^}]*useActionState[^}]*\}\s*from\s*['"]react['"]/

function patchUseActionState(source: string): string | null {
  if (!USE_ACTION_STATE_RE.test(source)) return null
  const patched = source.replace(
    /import\s+\{([^}]*)\}\s+from\s+['"]react['"]/g,
    (_match: string, exports: string) => {
      if (!exports.includes('useActionState')) return _match
      const items = exports.split(',').map((s: string) => s.trim())
      const rest = items.filter((s: string) => s !== 'useActionState')
      const lines: string[] = []
      if (rest.length > 0) lines.push(`import { ${rest.join(', ')} } from 'react'`)
      // Inline shim: returns [state, action] for server-side rendering.
      // The react-server-dom-webpack-server rejects useActionState, so we
      // bypass the dispatcher entirely and provide a simple implementation.
      // Checks globalThis.__rsc_formState which rsc-entry.tsx sets before
      // re-rendering after a server action, so the element tree in the RSC
      // payload reflects the updated state.
      lines.push(
        `const useActionState = (action, initialState, permalink) => {
          const fs = typeof globalThis !== 'undefined' ? globalThis.__rsc_formState : undefined;
          globalThis.__rsc_formState = undefined;
          if (fs !== undefined) {
            // Store the updated state for the server action handler so it
            // can use it as the previous state on the next action call.
            if (typeof globalThis !== 'undefined') {
              globalThis.__rsc_lastActionState = fs;
            }
            return [fs, action];
          }
          // Initial (non-action) render: store the initial state so the
          // server action handler can use it as the first prev state.
          if (typeof globalThis !== 'undefined' && globalThis.__rsc_lastActionState === undefined) {
            globalThis.__rsc_lastActionState = initialState;
          }
          return [initialState, action];
        }`,
      )
      return lines.join('\n')
    },
  )
  return patched !== source ? patched : null
}

async function load(
  this: PluginContext,
  id: string,
): Promise<string | { code: string; map: null } | undefined> {
  // === CLIENT ENVIRONMENT STUBS ===
  // Provide browser-safe modules for intercepted server-only modules.
  if (id === '\0reactify:client-stub') {
    return {
      code: [
        `export { default as Link } from '/$app/link.js'`,
        `export { default as Image } from '/$app/image.js'`,
        `export { RouteProvider } from '/$app/core.js'`,
        `export { RouteRenderer } from '/$app/root.js'`,
      ].join('\n'),
      map: null,
    }
  }
  if (id === '\0reactify:vite-config-stub') {
    return { code: 'export default {};', map: null }
  }

  // Patch user modules that import useActionState from react.
  // Target plain source files (not virtual, not node_modules).
  // This allows useActionState to work in RSC server components where the
  // react-server entry omits this hook.
  if (
    !id.startsWith('\0') &&
    !id.includes('node_modules') &&
    (id.endsWith('.tsx') || id.endsWith('.jsx') || id.endsWith('.ts') || id.endsWith('.js'))
  ) {
    try {
      const source = readFileSync(id, 'utf8')
      const patched = patchUseActionState(source)
      if (patched) return { code: patched, map: null }
    } catch {
      // File not readable — fall through to default handling
    }
  }

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

function transformIndexHtml(this: PluginContext, _html: string, ctx: { bundle?: unknown }): void {
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

  const outDir = ((rawConfig.build as Record<string, unknown>)?.outDir as string) ?? 'dist'

  // Set up #runtime alias for shared utilities (e.g. route-utils.js)
  const runtimeAlias = { find: '#runtime', replacement: runtimeAliasPath }

  // Resolve @vitejs/plugin-rsc aliases so Rolldown can find bare specifiers
  // from virtual modules (which have no physical file path for resolution base).
  const rscPkgAlias = rscPkgResolved
    ? { find: '@vitejs/plugin-rsc', replacement: rscPkgResolved + '/dist' }
    : null
  const resolveAliases = [runtimeAlias, rscPkgAlias].filter(Boolean)

  // The RSC environment is needed in both dev and build modes.
  // Deep-merge with existing rsc config to preserve settings from @vitejs/plugin-rsc
  // (e.g. resolve.noExternal, emitAssets, optimizeDeps).
  const entryExt = this?.ts ? 'tsx' : 'jsx'
  const existingRsc = (environments.rsc ?? {}) as Record<string, unknown>

  environments.rsc = {
    ...existingRsc,
    keepProcessEnv: false,
    build: {
      ...((existingRsc.build ?? {}) as Record<string, unknown>),
      outDir: `${outDir}/rsc`,
      rolldownOptions: undefined,
      rollupOptions: {
        ...(((existingRsc.build as Record<string, unknown>)?.rollupOptions ?? {}) as Record<
          string,
          unknown
        >),
        input: {
          'rsc-entry': `$app/rsc-entry.${entryExt}`,
        },
      },
    },
    resolve: {
      ...((existingRsc.resolve ?? {}) as Record<string, unknown>),
      alias: resolveAliases,
    },
    esbuild: {
      ...((existingRsc.esbuild ?? {}) as Record<string, unknown>),
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
  }

  // Also ensure @vitejs/plugin-rsc is resolvable in the SSR build
  const ssrEnv = environments.ssr as Record<string, unknown> | undefined
  if (ssrEnv) {
    const ssrResolve = (ssrEnv.resolve ?? {}) as Record<string, unknown>
    const ssrAliases = (ssrResolve.alias ?? []) as Array<Record<string, unknown>>
    if (rscPkgResolved && !ssrAliases.some((a) => a.find === '@vitejs/plugin-rsc')) {
      ssrResolve.alias = [...ssrAliases, rscPkgAlias]
    }
  }

  // Prevent duplicate React copies. @vitejs/plugin-rsc forces react and
  // react-dom into the SSR environment's noExternal (build) and
  // optimizeDeps.include (dev). Bundling React into the SSR bundle creates
  // a second copy whose hooks dispatcher is null — causing "Invalid hook call".
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
  const rscEnvironment = environments.rsc as Record<string, unknown>
  const rscOptimizeDeps = (rscEnvironment?.optimizeDeps ?? {}) as Record<string, unknown>
  const rscDepsInclude = rscOptimizeDeps.include
  if (rscDepsInclude && Array.isArray(rscDepsInclude)) {
    rscOptimizeDeps.include = (rscDepsInclude as string[]).filter(
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
    // Prevent Rolldown scanner from trying to pre-bundle $app/ virtual modules
    // and the reactify package itself. The optimizer strips the try/catch guard
    // around new AsyncLocalStorage() in rsc-context.ts during pre-bundling,
    // causing "AsyncLocalStorage is not a constructor" in the browser when
    // server-only modules (@cyb3rcore/reactify/server) are loaded.
    const clientOptimizeDeps = (clientEnv.optimizeDeps ?? {}) as Record<string, unknown>
    const existingExclude = (clientOptimizeDeps.exclude as string[]) ?? []
    const newExcludes: string[] = [...existingExclude]
    if (!existingExclude.includes('$app/*')) newExcludes.push('$app/*')
    for (const pkgName of reactifyPkgExcludes) {
      if (!existingExclude.some((e) => e === pkgName || e.startsWith(pkgName + '/'))) {
        newExcludes.push(pkgName)
      }
    }
    if (newExcludes.length > existingExclude.length) {
      clientOptimizeDeps.exclude = newExcludes
      clientEnv.optimizeDeps = clientOptimizeDeps
    }
    // Also set at the top level for Vite's optimizer
    const topAliases = ((rawConfig.resolve as Record<string, unknown>)?.alias ?? []) as Array<
      Record<string, unknown>
    >
    if (!topAliases.some((a) => a.find === '@vitejs/plugin-rsc')) {
      rawConfig.resolve = {
        ...(rawConfig.resolve as Record<string, unknown>),
        alias: [...topAliases, rscPkgAlias],
      }
    }
  }

  // Ensure a single React instance across all environments by deduplicating
  // resolves to the consumer's copy. Without this, the Vite module runner may
  // resolve React from the framework's node_modules when processing virtual
  // modules ($app/*), causing "Invalid hook call" from mismatched React copies.
  if (!rawConfig.resolve) rawConfig.resolve = {}
  const resolveConfig = rawConfig.resolve as Record<string, unknown>
  const existingDedupe = (resolveConfig.dedupe ?? []) as string[]
  if (!existingDedupe.includes('react')) {
    resolveConfig.dedupe = [...existingDedupe, 'react', 'react-dom']
  }

  // Propagate React deduplication to each environment
  for (const envName of ['ssr', 'rsc', 'client'] as const) {
    const env = (environments[envName] ?? {}) as Record<string, unknown>
    const envResolve = (env.resolve ?? {}) as Record<string, unknown>
    const envDedupe = (envResolve.dedupe ?? []) as string[]
    if (!envDedupe.includes('react')) {
      envResolve.dedupe = [...envDedupe, 'react', 'react-dom']
      env.resolve = envResolve
      environments[envName] = env
    }
  }

  // Ensure framework dependencies resolve even when the package isn't hoisted
  // (e.g., when reactify is installed via file: or link: protocol).
  // Virtual modules ($app/*) have no physical filesystem path, so Vite can't
  // resolve bare specifiers from them using the standard algorithm. Providing
  // explicit aliases lets Vite resolve these from the framework's node_modules.
  interface AliasEntry {
    find: string
    replacement: string
    environments: string[]
  }
  const requiredAliases: AliasEntry[] = []
  if (rscHtmlStreamResolved) {
    requiredAliases.push({
      find: 'rsc-html-stream',
      replacement: rscHtmlStreamResolved,
      environments: ['client', 'rsc', 'ssr'],
    })
  }
  if (devalueResolved) {
    requiredAliases.push({
      find: 'devalue',
      replacement: devalueResolved,
      environments: ['rsc', 'ssr'],
    })
  }

  for (const alias of requiredAliases) {
    // Top-level resolve
    const topAliases = ((rawConfig.resolve as Record<string, unknown>)?.alias ?? []) as Array<
      Record<string, unknown>
    >
    if (!topAliases.some((a: Record<string, unknown>) => a.find === alias.find)) {
      rawConfig.resolve = {
        ...(rawConfig.resolve as Record<string, unknown>),
        alias: [...topAliases, { find: alias.find, replacement: alias.replacement }],
      }
    }

    // Per-environment resolve
    for (const envName of alias.environments) {
      const env = (environments[envName] ?? {}) as Record<string, unknown>
      const envResolve = (env.resolve ?? {}) as Record<string, unknown>
      const envAliases = (envResolve.alias ?? []) as Array<Record<string, unknown>>
      if (!envAliases.some((a: Record<string, unknown>) => a.find === alias.find)) {
        env.resolve = {
          ...envResolve,
          alias: [...envAliases, { find: alias.find, replacement: alias.replacement }],
        }
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
  rollupWarn: (warning: {
    code?: string
    message?: { includes?: (s: string) => boolean }
    exporter?: string
  }) => void,
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
