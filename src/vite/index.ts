import type { Readable } from 'node:stream'
import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify'
import type { ViteDevServer } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'
import fp from 'fastify-plugin'
import { configure } from './config.js'
import { hasIterableRoutes, type ReactifyViteDecorationPriorToSetup } from './mode/support.js'
import type { ClientEntries, ClientModule } from './types/client.js'
import type { HtmlTemplateFunction } from './types/html.js'
import type {
  DevRuntimeConfig,
  ReactifyViteOptions,
  ProdRuntimeConfig,
  RuntimeConfig,
} from './types/options.js'
import type { RendererOption } from './types/renderer.js'
import type {
  ReplyDotHtmlFunction,
  ReplyDotRenderContext,
  ReplyDotRenderFunction,
  ReplyDotRenderResult,
} from './types/reply.js'
import type { ClientRouteArgs, CreateRouteArgs, RouteDefinition } from './types/route.js'
import type { SerializableViteConfig } from './types/vite-configs.js'

// Re-export types for consumers
export type {
  ClientEntries,
  ClientModule,
  ClientRouteArgs,
  CreateRouteArgs,
  DevRuntimeConfig,
  ReactifyViteOptions,
  HtmlTemplateFunction,
  ProdRuntimeConfig,
  RendererOption,
  ReplyDotHtmlFunction as HtmlFunction,
  ReplyDotRenderContext as RenderContext,
  ReplyDotRenderFunction as RenderFunction,
  ReplyDotRenderResult as RenderResult,
  RouteDefinition,
  RuntimeConfig,
  SerializableViteConfig,
}

// Module augmentation for Fastify
declare module 'fastify' {
  interface FastifyReply {
    html(
      ctx?: ReplyDotRenderResult,
    ): FastifyReply | string | Readable | Promise<FastifyReply | string | Readable>
    render(ctx?: ReplyDotRenderContext): ReplyDotRenderResult | Promise<ReplyDotRenderResult>
  }

  interface FastifyInstance {
    vite: ReactifyViteDecoration
  }
}

interface ModeModule {
  setup: (ctx: ReactifyViteDecorationPriorToSetup) => Promise<ClientModule | null>
  hot?: symbol
}

const kMode = Symbol('kMode')
const kOptions = Symbol('kOptions')

/** Read a value stored on the Fastify instance via symbol decoration. */
function getSymbolState<T>(scope: FastifyInstance, sym: symbol): T | undefined {
  return (scope as unknown as Record<symbol, T | undefined>)[sym]
}

/**
 * Decorate Fastify instances with Vite integration.
 *
 * Call \`ready()\` after all plugins are registered to start Vite setup,
 * decorate reply methods, and register client-derived routes.
 */
class ReactifyViteDecoration implements ReactifyViteDecorationPriorToSetup {
  scope: FastifyInstance
  createServer?: unknown
  runtimeConfig!: RuntimeConfig
  devServer?: ViteDevServer
  entries?: ClientEntries
  runners?: Record<string, ModuleRunner>;
  [key: symbol]: unknown

  private [kOptions]: ReactifyViteOptions
  private [kMode]!: ModeModule

  constructor(scope: FastifyInstance, options: ReactifyViteOptions) {
    this.scope = scope
    this.createServer = (options as unknown as { createServer?: unknown }).createServer
    this[kOptions] = options
  }

  /**
   * Completes reactify runtime initialization.
   *
   * This is intentionally not run during plugin registration; call
   * `await server.vite.ready()` when your app is ready to start Vite setup,
   * decorate reply methods, and register client-derived routes.
   */
  async ready(): Promise<void> {
    // Merge user options with defaults and resolve the full Vite configuration
    this.runtimeConfig = await configure(this[kOptions])

    // Allow renderer packages to hook into the Fastify lifecycle before Vite starts
    if (this.runtimeConfig.prepareServer) {
      await this.runtimeConfig.prepareServer(this.scope, this.runtimeConfig)
    }

    // Dev mode: boot Vite development server with HMR. Prod mode: load production bundles.
    if (this.runtimeConfig.dev) {
      this[kMode] = (await import('./mode/development.js')) as ModeModule
    } else {
      // Assumes presence of and uses production bundled distribution
      this[kMode] = (await import('./mode/production.js')) as ModeModule
    }

    // Get client module based on the Vite server bundle
    const client = await this[kMode].setup(this)

    // Register Fastify routes from the client-provided route manifest
    if (hasIterableRoutes(client)) {
      for (const route of client.routes) {
        if (this.runtimeConfig.dev) {
          const hotSymbol = this[kMode].hot!
          const hmrClient = (): ClientModule | undefined =>
            getSymbolState<{ client?: ClientModule | null }>(this.scope, hotSymbol)?.client ??
            client ??
            undefined
          const hmrRoute = () =>
            getSymbolState<{ routeHash?: Map<string, RouteDefinition> }>(
              this.scope,
              hotSymbol,
            )?.routeHash?.get(route.path!) ?? route

          const hmrHandler = async (req: FastifyRequest, reply: FastifyReply) => {
            const handler = await this.runtimeConfig.createRouteHandler(
              { client: hmrClient(), route: hmrRoute() },
              this.scope,
              this.runtimeConfig,
            )
            return await handler.call(this.scope, req, reply)
          }
          const hmrErrorHandler = async (
            error: FastifyError,
            req: FastifyRequest,
            reply: FastifyReply,
          ) => {
            const errorHandler = await this.runtimeConfig.createErrorHandler(
              { client: hmrClient(), route: hmrRoute() },
              this.scope,
              this.runtimeConfig,
            )
            return await errorHandler.call(this.scope, error, req, reply)
          }

          await this.runtimeConfig.createRoute(
            {
              client,
              route,
              async handler(...args: Parameters<typeof hmrHandler>) {
                return await hmrHandler(...args)
              },
              async errorHandler(...args: Parameters<typeof hmrErrorHandler>) {
                return await hmrErrorHandler(...args)
              },
            },
            this.scope,
            this.runtimeConfig,
          )
        } else {
          // Create route handler and route error handler functions
          const handler = await this.runtimeConfig.createRouteHandler(
            { client, route },
            this.scope,
            this.runtimeConfig,
          )

          const errorHandler = await this.runtimeConfig.createErrorHandler(
            {
              client,
              route,
            },
            this.scope,
            this.runtimeConfig,
          )

          await this.runtimeConfig.createRoute(
            {
              client,
              handler,
              errorHandler,
              route,
            },
            this.scope,
            this.runtimeConfig,
          )
        }
      }
    }
  }
}

const pluginFn: FastifyPluginCallback<ReactifyViteOptions> = (scope, options, done) => {
  scope.decorate('vite', new ReactifyViteDecoration(scope, options))
  done()
}

const reactifyVite = fp(pluginFn, {
  fastify: '5.x',
  name: 'reactify-vite',
})

export default reactifyVite
export { reactifyVite }
