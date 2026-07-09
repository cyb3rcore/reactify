import { DefaultConfig } from './config/defaults.js'
import { resolveClientModule, resolveRoot } from './config/paths.js'
import { resolveDevViteConfig, resolveProdViteConfig } from './config/vite-config.js'
import type { ReactifyViteOptions, RuntimeConfig, IncompleteRuntimeConfig } from './types/options.js'

let hasWarnedDeprecatedViteAlias = false

/**
 * Merge user-provided options with system defaults, resolve the Vite config
 * (dev or production), dynamically load the renderer package (if specified),
 * and apply renderer-provided settings on top of user options.
 *
 * The resulting {@link RuntimeConfig} is the single source of truth consumed
 * by the rest of the framework.
 */
export async function configure(options: ReactifyViteOptions): Promise<RuntimeConfig> {
  const defaultConfig = { ...DefaultConfig }
  const { dev } = options
  const root = resolveRoot(options.root)
  const isDevMode = typeof dev === 'boolean' ? dev : defaultConfig.dev
  const runtimeConfig = Object.assign(defaultConfig, { ...options }) as IncompleteRuntimeConfig

  runtimeConfig.root = root

  const viteConfig = isDevMode
    ? await resolveDevViteConfig(root)
    : await resolveProdViteConfig(root, { distDir: runtimeConfig.distDir })

  runtimeConfig.viteConfig = viteConfig

  // Deprecated alias: `config.vite` → `config.viteConfig`.
  // The `vite` property emits a one-time DeprecationWarning on first access.
  // Remove this shim once the migration window closes.
  Object.defineProperty(runtimeConfig, 'vite', {
    configurable: true,
    enumerable: false,
    get() {
      if (!hasWarnedDeprecatedViteAlias) {
        hasWarnedDeprecatedViteAlias = true
        process.emitWarning(
          '`config.vite` is deprecated and will be removed in a future release. Use `config.viteConfig` instead.',
          'DeprecationWarning',
        )
      }
      return runtimeConfig.viteConfig
    },
  })

  // Dynamic renderer loading: if the user passed a module specifier string
  // (e.g. a package name like "reactify-renderer-react"), import it now and
  // merge its default + named exports into the renderer config object.
  if (typeof runtimeConfig.renderer === 'string') {
    const { default: renderer, ...named } = await import(runtimeConfig.renderer)
    runtimeConfig.renderer = { ...renderer, ...named }
  }
  /*
   * Priority chain for every configurable setting:
   *
   *   1. User-provided option (already merged into runtimeConfig)
   *   2. Renderer package default (from the imported renderer module)
   *   3. System default (from DefaultConfig in defaults.ts)
   *
   * The loop below implements step 2: for each known setting key, the
   * renderer's value (if present) takes precedence over whatever was set
   * by the user or the system default above.
   */
  const rendererSettings = [
    'clientModule',
    'createErrorHandler',
    'createHtmlFunction',
    'createHtmlTemplateFunction',
    'createRenderFunction',
    'createRoute',
    'createRouteHandler',
    'prepareServer',
    'prepareClient',
  ] as const
  type RendererSettingKey = (typeof rendererSettings)[number]

  for (const setting of rendererSettings) {
    const rendererConfig = runtimeConfig.renderer as Record<string, unknown>
    const configRecord = runtimeConfig as unknown as Record<RendererSettingKey, unknown>
    configRecord[setting] = rendererConfig[setting] ?? configRecord[setting]
  }

  runtimeConfig.clientModule =
    viteConfig.fastify?.clientModule ??
    runtimeConfig.clientModule ??
    resolveClientModule(viteConfig.root)

  // At this point, viteConfig is set, so it's a valid RuntimeConfig
  return runtimeConfig as RuntimeConfig
}
