import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { ClientModule, ClientEntries } from '../vite/types/client.js'
import type { RuntimeConfig } from '../vite/types/options.js'
import type { ClientRouteArgs, CreateRouteArgs, RouteDefinition } from '../vite/types/route.js'
import RouteContext from './context.js'
import { rscStore, setSyncContext } from './rsc-context.js'

/**
 * Route metadata specific to the React renderer.
 * Extends RouteDefinition with the React-specific lifecycle hooks
 * that pages can export (getData, getMeta, onEnter, rsc, etc.).
 */
interface ReactRouteDef extends RouteDefinition {
  getData?: boolean | ((ctx: Record<string, unknown>) => Promise<Record<string, unknown>>)
  getMeta?: boolean | ((ctx: Record<string, unknown>) => Promise<Record<string, unknown>>)
  onEnter?: boolean | ((ctx: Record<string, unknown>) => Promise<Record<string, unknown>>)
  rsc?: boolean
  configure?: (scope: FastifyInstance) => void | Promise<void>
  id?: string
  streaming?: boolean
  clientOnly?: boolean
  serverOnly?: boolean
  method?: string | string[]
}

/**
 * Resolve client-side module entries from the Vite SSR bundle.
 * Awaits any pending promises on context, routes, and create — these
 * can arrive as unresolved promises from dynamic imports.
 */
export async function prepareClient(
  entries: ClientEntries,
  _scope?: FastifyInstance,
  _config?: RuntimeConfig,
): Promise<ClientModule> {
  const client = entries.ssr!
  if ((client.context as unknown) instanceof Promise) {
    client.context = await (client.context as Promise<unknown>)
  }
  if ((client.routes as unknown) instanceof Promise) {
    const resolvedRoutes = await (client.routes as unknown as Promise<unknown>)
    client.routes = resolvedRoutes as Iterable<RouteDefinition>
  }
  if ((client.create as unknown) instanceof Promise) {
    const { default: create } = await (client.create as unknown as Promise<{ default: unknown }>)
    client.create = create as unknown as (...args: never[]) => unknown
  }
  // Attach the RSC handler from the RSC environment entry (rsc-entry.tsx)
  if (entries.rsc) {
    client.rscHandler = entries.rsc
  }
  return client
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function createErrorHandler(
  _args: ClientRouteArgs,
  scope: FastifyInstance,
  config: RuntimeConfig,
): (error: Error, req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply> {
  return async (error: Error, req: FastifyRequest, reply: FastifyReply) => {
    req.log.error(error)
    if (config.dev) {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? (error.stack ?? '') : ''
      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>500 — ${escapeHtml(message)}</title>
<style>
body{font-family:ui-monospace,monospace;background:#0d1117;color:#e6edf3;padding:2rem;max-width:960px;margin:0 auto}
h1{color:#f85149;font-size:1.5rem}
.summary{margin:1rem 0;padding:1rem;background:#161b22;border-radius:6px}
.stack{background:#161b22;border-radius:6px;overflow-x:auto;padding:1rem;font-size:.85rem;line-height:1.5}
</style></head>
<body><h1>500 — ${escapeHtml(error instanceof Error ? error.name : 'Error')}</h1>
<div class="summary"><strong>${escapeHtml(message)}</strong></div>
<pre class="stack">${escapeHtml(stack)}</pre></body></html>`
      reply.code(500)
      reply.type('text/html')
      reply.send(html)
      return reply
    }
    reply.code(500)
    reply.send('')
    return reply
  }
}

/**
 * Register a Fastify route with React-specific hooks.
 *
 * Handles context creation (RouteContext.create), data loading (getData),
 * head metadata (getMeta), onEnter lifecycle, RSC handler routing, and
 * companion _.rsc route registration for client-side action/fetch URLs.
 */
export async function createRoute(
  args: CreateRouteArgs,
  scope: FastifyInstance,
  config: RuntimeConfig,
): Promise<void> {
  const client = args.client
  const errorHandler = args.errorHandler as (...args: unknown[]) => unknown
  const route = args.route as ReactRouteDef
  if (route.configure) {
    await route.configure(scope)
  }

  // Used when hydrating routes on the client
  const routeMap = Object.fromEntries(
    (client.routes as Array<Record<string, unknown>>).map((_) => [_.path, _]),
  )

  // Extend RouteContext prototype with init module (adds user-defined methods/properties)
  RouteContext.extend(client.context as Record<string, unknown>)

  const onRequest = async (req: FastifyRequest, reply: FastifyReply) => {
    ;(req as unknown as Record<string, unknown>).route = await RouteContext.create(
      scope,
      req,
      reply,
      route as Parameters<typeof RouteContext.create>[3],
      client.context as Record<string, unknown>,
    )
  }

  const preHandler: Array<(req: FastifyRequest) => Promise<void>> = [
    async (req: FastifyRequest) => {
      // RSC routes use client.rscHandler.fetch() which manages its own
      // rendering. Creating a React app with RouteProvider/RouteRenderer
      // here would conflict with the RSC handler — skip it entirely.
      if (route.rsc) return
      const reqRoute = (req as unknown as Record<string, unknown>).route as Record<string, unknown>
      if (!reqRoute.clientOnly) {
        const app = (client.create as (...args: unknown[]) => unknown)({
          routes: client.routes,
          routeMap,
          ctxHydration: reqRoute,
          url: req.url,
        })
        reqRoute.app = app
      }
    },
  ]

  if (route.getData) {
    preHandler.push(async (req: FastifyRequest) => {
      const reqRoute = (req as unknown as Record<string, unknown>).route as Record<string, unknown>
      if (!reqRoute.data) {
        reqRoute.data = {}
      }
      const result = await (
        route.getData as (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>
      )(reqRoute)
      Object.assign(reqRoute.data as Record<string, unknown>, result)
    })
  }

  if (route.getMeta) {
    preHandler.push(async (req: FastifyRequest) => {
      const reqRoute = (req as unknown as Record<string, unknown>).route as Record<string, unknown>
      reqRoute.head = await (
        route.getMeta as (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>
      )(reqRoute)
    })
  }

  if (route.onEnter) {
    preHandler.push(async (req: FastifyRequest) => {
      try {
        if (route.onEnter) {
          const reqRoute = (req as unknown as Record<string, unknown>).route as Record<
            string,
            unknown
          >
          if (!reqRoute.data) {
            reqRoute.data = {}
          }
          const result = await (
            route.onEnter as (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>
          )(reqRoute)
          Object.assign(reqRoute.data as Record<string, unknown>, result)
        }
      } catch (err: unknown) {
        if (config.dev) {
          console.error(err)
        }
        ;((req as unknown as Record<string, unknown>).route as Record<string, unknown>).error = err
      }
    })
  }

  // Route handler
  let handler: ((req: FastifyRequest, reply: FastifyReply) => unknown) | undefined
  // ---- Section divider ----
  if (route.rsc) {
    handler = async (req: FastifyRequest, reply: FastifyReply) => {
      const ctx = { req, reply, server: scope }
      // Store scope in req.route so convertRequest can attach it to the RSC Request
      const routeData = (req as unknown as Record<string, unknown>).route as
        | Record<string, unknown>
        | undefined
      if (routeData) {
        routeData.server = scope
      }
      await rscStore.run(ctx, async () => {
        setSyncContext(ctx)
        const { convertRequest, sendResponse } = await import('./rsc-handler.js')
        const request = await convertRequest(req)
        const response = await (
          client.rscHandler as { fetch: (req: unknown) => Promise<Response> }
        ).fetch(request)
        sendResponse(reply, response)
      })
      return reply
    }
    // ---- Section divider ----
  } else {
    handler = async (req: FastifyRequest, reply: FastifyReply) => {
      const ctx = { req, reply, server: scope }
      setSyncContext(ctx)
      try {
        return await reply.html()
      } finally {
        setSyncContext(null)
      }
    }
  }

  // Replace wildcard routes with Fastify compatible syntax
  const routePath = (route.path as string).replace(/:\w[\w-]*\+/, '*')

  unshiftHook(route, 'onRequest', onRequest)
  unshiftHook(route, 'preHandler', preHandler)

  ;(
    scope as unknown as {
      route(opts: Record<string, unknown>): void
      get(path: string, opts: Record<string, unknown>): void
    }
  ).route({
    url: routePath,
    method: route.method ?? ['GET', 'POST', 'PUT', 'DELETE'],
    errorHandler,
    handler,
    ...route,
  })

  // ---- Section divider ----
  // Register companion route for RSC _.rsc suffix requests.
  // Client-side code constructs action/fetch URLs as ${pathname}_.rsc.
  // Without this companion route, Fastify returns 404 for these requests.
  if (route.rsc) {
    ;(
      scope as unknown as {
        route(opts: Record<string, unknown>): void
        get(path: string, opts: Record<string, unknown>): void
      }
    ).route({
      url: routePath + '_.rsc',
      method: ['GET', 'POST'],
      errorHandler,
      handler,
      onRequest: route.onRequest,
      preHandler: route.preHandler,
    })
  }

  if (route.getData) {
    // If getData is provided, register JSON endpoint for it
    ;(
      scope as unknown as {
        route(opts: Record<string, unknown>): void
        get(path: string, opts: Record<string, unknown>): void
      }
    ).get(`/-/data${routePath}`, {
      onRequest,
      async handler(req: FastifyRequest, _reply: FastifyReply) {
        return (route.getData as (ctx: Record<string, unknown>) => unknown)(
          (req as unknown as Record<string, unknown>).route as Record<string, unknown>,
        )
      },
    })
  }
}

function unshiftHook(route: Record<string, unknown>, hookName: string, hook: unknown): void {
  const existing = route[hookName]
  if (!existing) {
    route[hookName] = []
  }
  if (!Array.isArray(hook)) {
    if (!Array.isArray(route[hookName])) {
      route[hookName] = [route[hookName]]
    }
    ;(route[hookName] as unknown[]).unshift(hook)
  } else {
    if (!Array.isArray(route[hookName])) {
      route[hookName] = [route[hookName]]
    }
    ;(route[hookName] as unknown[]).push(...hook)
  }
}
