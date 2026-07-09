/**
 * Default implementations for every configurable hook used by Reactify.
 *
 * These values serve as the bottom of the priority chain (overridden by
 * user options and renderer-package defaults during config resolution).
 *
 * All functions are filled (never undefined) so consumers never need to
 * null-check — unconfigured hooks fall through to harmless no-ops or
 * reasonable fallback behaviour.
 */
import type { FastifyInstance, RouteHandlerMethod, RouteOptions } from 'fastify'
import { createHtmlTemplateFunction } from '../html.js'
import type { ClientEntries } from '../types/client.js'
import type { RuntimeConfig, IncompleteRuntimeConfig } from '../types/options.js'
import type { ReplyDotHtmlFunction, ReplyDotRenderResult } from '../types/reply.js'
import type { ClientRouteArgs, CreateRouteArgs } from '../types/route.js'

/** Defaults: all functions filled, but not root/viteConfig */
type ConfigDefaults = Omit<IncompleteRuntimeConfig, 'root' | 'viteConfig'>

export const DefaultConfig: ConfigDefaults = {
  /** Run in dev mode when the CLI flag is present */
  dev: process.argv.includes('--dev'),

  /** No renderer package by default; users supply one via options */
  renderer: {},

  /** Single-Page Application mode; when true, serve index.html for all routes */
  spa: false,

  /** Virtual import prefix for user-facing module specifiers (e.g. `$app/...`) */
  virtualModulePrefix: '$app',

  /** Hook called once before the Fastify server starts (e.g. plugin registration) */
  prepareServer(_scope, _config) {},

  /**
   * Hook called during client initialisation.
   * Resolves the SSR entry module and unwraps a lazy `routes()` function if
   * present, returning a plain client descriptor.
   */
  async prepareClient(entries: ClientEntries) {
    const clientModule = entries.ssr
    if (!clientModule) {
      return null
    }
    const routes =
      typeof clientModule.routes === 'function' ? await clientModule.routes() : clientModule.routes
    return Object.assign({}, clientModule, { routes })
  },

  /** Default HTML template function (minimal inlined template) */
  createHtmlTemplateFunction,

  /**
   * Build a `reply.html()` function from the raw HTML source.
   * Three code paths handle the different rendering modes.
   */
  async createHtmlFunction(
    source: string,
    scope: FastifyInstance,
    config: RuntimeConfig,
  ): Promise<ReplyDotHtmlFunction> {
    const indexHtmlTemplate = await config.createHtmlTemplateFunction(source)
    // SPA mode: render the bare shell (no server-side content).
    // The client-side router hydrates the rest.
    if (config.spa) {
      return function () {
        this.type('text/html')
        this.send(indexHtmlTemplate({ element: '' }))
        return this
      }
    }

    // SSR with a render function: the framework calls `reply.render(ctx)`
    // to produce the serialised payload, then wraps it in the HTML template.
    if (config.hasRenderFunction) {
      return async function (ctx?: ReplyDotRenderResult) {
        this.type('text/html')
        this.send(await indexHtmlTemplate(ctx ?? (await this.render(ctx))))
        return this
      }
    }

    // Fallback: the caller provides the rendered context directly.
    // No automatic render call — the context is expected to be pre-filled.
    return async function (ctx?: ReplyDotRenderResult) {
      this.type('text/html')
      this.send(await indexHtmlTemplate(ctx!))
      return this
    }
  },

  /**
   * Register a single route on the Fastify instance.
   * Skips if no route definition is provided, runs an optional
   * `route.configure` hook, then calls `scope.route(...)`.
   */
  async createRoute(args: CreateRouteArgs, scope: FastifyInstance): Promise<void> {
    const { handler, errorHandler, route } = args
    if (!route) {
      return
    }
    if (route.configure) {
      await route.configure(scope)
    }
    if (!route.path) {
      return
    }
    scope.route({
      url: route.path,
      method: route.method ?? 'GET',
      handler,
      errorHandler,
      ...route,
    })
  },

  /**
   * Create the Fastify route handler for a client page.
   * Two code paths handle the two rendering strategies.
   */
  createRouteHandler(
    { client, route }: ClientRouteArgs,
    scope: FastifyInstance,
    config: RuntimeConfig,
  ): RouteHandlerMethod {
    // SSR render-function path: delegate to `reply.render()` which calls the
    // framework's internal rendering pipeline, then wrap the result in HTML.
    if (config.hasRenderFunction) {
      return async (req, reply) => {
        const page = await reply.render({
          app: scope,
          req,
          reply,
          client,
          route,
        })
        return reply.html(page)
      }
    }

    // Direct-render path: invoke the route's default export to get the
    // rendered element, then pass it through `reply.html()` for templating.
    return async (req, reply) => {
      const page = await route?.default?.({ app: scope, req, reply })
      return reply.html({
        app: scope,
        req,
        reply,
        client,
        route,
        element: page,
      })
    }
  },

  /**
   * Default error handler attached to every route.
   * In dev mode the full error is returned as JSON; in production a
   * generic 500 response is sent without leaking details.
   */
  createErrorHandler(
    _args: ClientRouteArgs,
    _scope: FastifyInstance,
    config: RuntimeConfig,
  ): NonNullable<RouteOptions['errorHandler']> {
    return (error, req, reply) => {
      if (config.dev) {
        console.log(error)
        reply.code(500).type('application/json').send(JSON.stringify({ error }))
      } else {
        reply.code(500).send('')
      }
    }
  },
}
