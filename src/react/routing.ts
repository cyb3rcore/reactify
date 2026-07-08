import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import Youch from 'youch'
import type { ClientModule, ClientEntries } from '../vite/types/client'
import type { RuntimeConfig } from '../vite/types/options'
import type { RouteDefinition } from '../vite/types/route'
import RouteContext from './context'
import { rscStore } from './rsc-context'

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
  return client
}

export function createErrorHandler(
  _args: Record<string, unknown>,
  scope: FastifyInstance,
  config: RuntimeConfig,
): (error: Error, req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply> {
  return async (error: Error, req: FastifyRequest, reply: FastifyReply) => {
    req.log.error(error)
    if (config.dev) {
      const youch = new Youch(error, req.raw)
      reply.code(500)
      reply.type('text/html')
      reply.send(await youch.toHTML())
      return reply
    }
    reply.code(500)
    reply.send('')
    return reply
  }
}

export async function createRoute(
  {
    client,
    errorHandler,
    route,
  }: {
    client: ClientModule
    errorHandler: (...args: unknown[]) => unknown
    route: ReactRouteDef
  },
  scope: FastifyInstance,
  config: RuntimeConfig,
): Promise<void> {
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
          const reqRoute = (req as unknown as Record<string, unknown>).route as Record<string, unknown>
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
  if (route.rsc) {
    handler = async (req: FastifyRequest, reply: FastifyReply) => {
      await rscStore.run(
        {
          req,
          reply,
          server: scope,
        },
        async () => {
          const { convertRequest, sendResponse } = await import('./rsc-handler')
          const request = await convertRequest(req)
          const response = await (
            client.rscHandler as { fetch: (req: unknown) => Promise<Response> }
          ).fetch(request)
          sendResponse(reply, response)
        },
      )
    }
  } else if (config.dev) {
    handler = async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.html()
    }
  } else {
    handler = async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.html()
    }
  }

  // Replace wildcard routes with Fastify compatible syntax
  const routePath = (route.path as string).replace(/:\w[\w-]*\+/, '*')

  unshiftHook(route, 'onRequest', onRequest)
  unshiftHook(route, 'preHandler', preHandler)

  ;(scope as unknown as {
    route(opts: Record<string, unknown>): void
    get(path: string, opts: Record<string, unknown>): void
  }).route({
    url: routePath,
    method: route.method ?? ['GET', 'POST', 'PUT', 'DELETE'],
    errorHandler,
    handler,
    ...route,
  })

  if (route.getData) {
    // If getData is provided, register JSON endpoint for it
    ;(scope as unknown as {
      route(opts: Record<string, unknown>): void
      get(path: string, opts: Record<string, unknown>): void
    }).get(`/-/data${routePath}`, {
      onRequest,
      async handler(req: FastifyRequest, _reply: FastifyReply) {
        return (route.getData as (ctx: Record<string, unknown>) => unknown)(
          (req as unknown as Record<string, unknown>).route as Record<string, unknown>,
        )
      },
    })
  }
}

function unshiftHook(
  route: Record<string, unknown>,
  hookName: string,
  hook: unknown,
): void {
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
