import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createServer, createServerModuleRunner, isRunnableDevEnvironment } from 'vite'
import middie, { type Handler as MiddieHandler } from '@fastify/middie'
import type { ClientModule } from '../types/client.js'
import type { DevRuntimeConfig } from '../types/options.js'
import type { RouteDefinition } from '../types/route.js'
import { hasIterableRoutes, type ReactifyViteDecorationPriorToSetup } from './support.js'

export const hot = Symbol('hotModuleReplacementProxy')

interface HotState {
  client?: ClientModule | null
  routeHash?: Map<string, RouteDefinition>
}

/** Fastify scope after being decorated with hot state */
interface HotScope extends FastifyInstance {
  [hot]: HotState
}

/** Module loaded via ModuleRunner that may have a default export */
interface LoadedEntryModule {
  default?: ClientModule
  [key: string]: unknown
}

async function loadEntryModulePaths(
  runtimeConfig: DevRuntimeConfig,
): Promise<Record<string, string> | null> {
  if (runtimeConfig.spa) return null

  const { viteConfig } = runtimeConfig
  const result: Record<string, string> = {}

  for (const [envName, env] of Object.entries(viteConfig.environments ?? {})) {
    if (envName === 'client') continue
    const input = env.build?.rollupOptions?.input
    if (!input) continue
    const entry = Object.values(input).find(Boolean) as string | undefined
    if (!entry) continue
    // Strip Vite's \0 virtual module prefix before checking against virtualModulePrefix
    const cleanPath = entry.charCodeAt(0) === 0 ? entry.slice(1) : entry
    result[envName] = cleanPath.startsWith(runtimeConfig.virtualModulePrefix)
      ? cleanPath
      : resolve(viteConfig.root, cleanPath.replace(/^\/+/, ''))
  }
  return Object.keys(result).length > 0 ? result : null
}

export async function loadEntries(
  reactifyViteDecoration: ReactifyViteDecorationPriorToSetup,
  config: DevRuntimeConfig,
): Promise<void> {
  // Initialize runners object only once to prevent memory leaks
  // Vite's ModuleRunner.import() automatically returns the latest version after HMR updates
  if (!reactifyViteDecoration.runners) {
    reactifyViteDecoration.runners = {}
  }

  const entryModulePaths = await loadEntryModulePaths(config)

  if (!entryModulePaths) {
    return
  }

  for (const [env, envConfig] of Object.entries(reactifyViteDecoration.devServer!.environments)) {
    if (env === 'client') {
      continue
    }

    // Reuse existing runner or create a new one
    // Use the environment's own runner (RunnableDevEnvironment.runner) where available
    // to avoid creating a second ModuleRunner instance later when @vitejs/plugin-rsc
    // performs cross-environment imports via import.meta.viteRsc.import('ssr', ...).
    let runner = reactifyViteDecoration.runners[env]
    if (!runner) {
      runner = isRunnableDevEnvironment(envConfig)
        ? envConfig.runner
        : createServerModuleRunner(envConfig)
      reactifyViteDecoration.runners[env] = runner
    }

    if (env in entryModulePaths) {
      const entryModule = (await runner.import(entryModulePaths[env])) as LoadedEntryModule
      const clientModule: ClientModule = entryModule.default ?? entryModule
      if (!reactifyViteDecoration.entries![env]) {
        reactifyViteDecoration.entries![env] = { ...clientModule }
      } else {
        Object.assign(reactifyViteDecoration.entries![env], clientModule)
      }
    }
  }
}

export async function setup(
  reactifyViteDecoration: ReactifyViteDecorationPriorToSetup,
): Promise<ClientModule | null> {
  const runtimeConfig = reactifyViteDecoration.runtimeConfig as DevRuntimeConfig

  if (!reactifyViteDecoration.scope.hasDecorator('use')) {
    await reactifyViteDecoration.scope.register(middie)
  }

  reactifyViteDecoration.devServer = await createServer({
    configFile: runtimeConfig.viteConfig.configFile,
    server: {
      middlewareMode: true,
      hmr: {
        server: reactifyViteDecoration.scope.server,
      },
    },
    appType: 'custom',
  })

  // Ensure all server environments are accessible via import.meta.viteRsc
  // by wrapping the RSC plugin's cross-environment import function.
  // The RSC plugin's configureServer sets __VITE_ENVIRONMENT_RUNNER_IMPORT__
  // with an isRunnableDevEnvironment check that may fail for environments
  // created by other plugins. We wrap it to create a module runner on demand.
  // Store fallback runners keyed by environment name to avoid creating new ones per call
  const fallbackRunners = new Map<string, ReturnType<typeof createServerModuleRunner>>()
  if (globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__) {
    const originalImport = globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__
    globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__ = async (environmentName: string, id: string) => {
      const env = reactifyViteDecoration.devServer!.environments[environmentName]
      if (!env) throw new Error(`[reactify] unknown environment '${environmentName}'`)
      if (isRunnableDevEnvironment(env)) {
        return env.runner.import(id)
      }
      // Use/create a fallback runner for non-runnable environments
      let runner = fallbackRunners.get(environmentName)
      if (!runner || runner.isClosed()) {
        runner = createServerModuleRunner(env)
        fallbackRunners.set(environmentName, runner)
      }
      return runner.import(id)
    }
  }
  // Connect.Server implements the middleware handler interface
  reactifyViteDecoration.scope.use(
    reactifyViteDecoration.devServer.middlewares as unknown as MiddieHandler,
  )

  reactifyViteDecoration.entries = {}

  reactifyViteDecoration.scope.decorate(hot, {})
  // After decoration, the scope has the hot state
  const hotScope = reactifyViteDecoration.scope as HotScope

  reactifyViteDecoration.scope.decorateReply('render', null as never)
  reactifyViteDecoration.scope.decorateReply('html', null as never)

  Object.defineProperty(runtimeConfig, 'hasRenderFunction', {
    writable: false,
    value: typeof runtimeConfig.createRenderFunction === 'function',
  })

  reactifyViteDecoration.scope.addHook(
    'onRequest',
    async (req: FastifyRequest, reply: FastifyReply) => {
      await loadEntries(reactifyViteDecoration, runtimeConfig)
      const clientResult =
        !runtimeConfig.spa &&
        (await runtimeConfig.prepareClient(
          reactifyViteDecoration.entries!,
          reactifyViteDecoration.scope,
          runtimeConfig,
        ))
      const client = clientResult ? (clientResult as ClientModule) : null
      hotScope[hot].client = client
      if (client && hasIterableRoutes(client)) {
        if (!hotScope[hot].routeHash) {
          hotScope[hot].routeHash = new Map<string, RouteDefinition>()
        }
        for (const route of client.routes) {
          if (route.path) {
            hotScope[hot].routeHash.set(route.path, route)
          }
        }
      }
      const { viteConfig } = runtimeConfig
      const indexHtmlPath = join(viteConfig.root, 'index.html')
      const indexHtml = await readFile(indexHtmlPath, 'utf8')
      const transformedHtml = await reactifyViteDecoration.devServer!.transformIndexHtml(
        req.url,
        indexHtml,
      )

      reply.html = await runtimeConfig.createHtmlFunction(
        transformedHtml,
        reactifyViteDecoration.scope,
        runtimeConfig,
      )

      if (runtimeConfig.hasRenderFunction) {
        reply.render = await runtimeConfig.createRenderFunction!(
          hotScope[hot].client!,
          reactifyViteDecoration.scope,
          runtimeConfig,
        )
      }
    },
  )

  reactifyViteDecoration.scope.addHook('onClose', async () => {
    // Close all runners to clean up HMR event listeners
    if (reactifyViteDecoration.runners) {
      await Promise.all(
        Object.values(reactifyViteDecoration.runners).map((runner) => runner.close()),
      )
    }
    // Close all fallback runners created for non-runnable environments
    await Promise.all(
      Array.from(fallbackRunners.values()).map((runner) => runner.close()),
    )
    await reactifyViteDecoration.devServer!.close()
  })

  await loadEntries(reactifyViteDecoration, runtimeConfig)

  const clientResult =
    !runtimeConfig.spa &&
    (await runtimeConfig.prepareClient(
      reactifyViteDecoration.entries!,
      reactifyViteDecoration.scope,
      runtimeConfig,
    ))
  const client = clientResult ? (clientResult as ClientModule) : null

  return client
}
