import { readFileSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import type { FastifyRequest, FastifyReply } from 'fastify'
import Youch from 'youch'
import RouteContext from './context'
import { createHtmlFunction } from './rendering'
import { rscStore } from './rsc-context'

export async function prepareClient(
  entries: Record<string, unknown>,
  _: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = entries.ssr as Record<string, unknown>
  if ((client.context as unknown) instanceof Promise) {
    client.context = await (client.context as Promise<unknown>)
  }
  if ((client.routes as unknown) instanceof Promise) {
    client.routes = await (client.routes as Promise<unknown>)
  }
  if ((client.create as unknown) instanceof Promise) {
    const { default: create } = await (client.create as Promise<{ default: unknown }>)
    client.create = create
  }
  return client
}

export function createErrorHandler(
  _: Record<string, unknown>,
  scope: Record<string, unknown>,
  config: Record<string, unknown>,
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
    client: Record<string, unknown>
    errorHandler: (...args: unknown[]) => unknown
    route: Record<string, unknown>
  },
  scope: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<void> {
  if (route.configure) {
    await (route.configure as (s: Record<string, unknown>) => void | Promise<void>)(scope)
  }

  // Used when hydrating Vue Router on the client
  const routeMap = Object.fromEntries(
    (client.routes as Array<Record<string, unknown>>).map((_) => [_.path, _]),
  )

  // Extend with route context initialization module
  RouteContext.extend(client.context as Record<string, unknown>)

  const onRequest = async (
    req: Record<string, unknown>,
    reply: Record<string, unknown>,
  ) => {
    req.route = await RouteContext.create(
      scope as unknown as Parameters<typeof RouteContext.create>[0],
      req as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
      route as Parameters<typeof RouteContext.create>[3],
      client.context as Record<string, unknown>,
    )
  }

  const preHandler = [
    async (req: Record<string, unknown>) => {
      const reqRoute = req.route as Record<string, unknown>
      if (!reqRoute.clientOnly) {
        const app = (client.create as (...args: unknown[]) => unknown)({
          routes: client.routes,
          routeMap,
          ctxHydration: req.route,
          url: (req as unknown as { url: string }).url,
        })
        reqRoute.app = app
      }
    },
  ]

  if (route.getData) {
    preHandler.push(async (req: Record<string, unknown>) => {
      const reqRoute = req.route as Record<string, unknown>
      if (!reqRoute.data) {
        reqRoute.data = {}
      }
      const result = await (
        route.getData as (ctx: Record<string, unknown>) => Record<string, unknown>
      )(reqRoute)
      Object.assign(reqRoute.data as Record<string, unknown>, result as Record<string, unknown>)
    })
  }

  if (route.getMeta) {
    preHandler.push(async (req: Record<string, unknown>) => {
      const reqRoute = req.route as Record<string, unknown>
      reqRoute.head = await (
        route.getMeta as (ctx: Record<string, unknown>) => Record<string, unknown>
      )(reqRoute)
    })
  }

  if (route.onEnter) {
    preHandler.push(async (req: Record<string, unknown>) => {
      try {
        if (route.onEnter) {
          const reqRoute = req.route as Record<string, unknown>
          if (!reqRoute.data) {
            reqRoute.data = {}
          }
          const result = await (
            route.onEnter as (ctx: Record<string, unknown>) => Record<string, unknown>
          )(reqRoute)
          Object.assign(reqRoute.data as Record<string, unknown>, result as Record<string, unknown>)
        }
      } catch (err: unknown) {
        if (config.dev) {
          console.error(err)
        }
        ;(req.route as Record<string, unknown>).error = err
      }
    })
  }

  // Route handler
  let handler: ((req: Record<string, unknown>, reply: Record<string, unknown>) => unknown) | undefined
  if (route.rsc) {
    handler = async (req: Record<string, unknown>, reply: Record<string, unknown>) => {
      await rscStore.run(
        {
          req: req as unknown as FastifyRequest,
          reply: reply as unknown as FastifyReply,
          server: scope as unknown as Parameters<typeof rscStore.run>[0]['server'],
        },
        async () => {
          const { convertRequest, sendResponse } = await import('./rsc-handler')
          const request = await convertRequest(req as unknown as FastifyRequest)
          const response = await (
            client.rscHandler as { fetch: (req: unknown) => Promise<Response> }
          ).fetch(request)
          sendResponse(reply as unknown as FastifyReply, response)
        },
      )
    }
  } else if (config.dev) {
    handler = (_: Record<string, unknown>, reply: Record<string, unknown>) => {
      ;(reply as unknown as { html: () => void }).html()
    }
  } else {
    const { id } = route
    const htmlPath = (id as string).replace('pages/', 'html/').replace(/\.(j|t)sx$/, '.html')
    // TODO: Switch to config.viteConfig once deprecated config.vite alias is removed.
    const viteConfig = config.vite as Record<string, unknown>
    const buildConfig = viteConfig.build as Record<string, unknown>
    let distDir = buildConfig.outDir as string
    if (!isAbsolute(distDir)) {
      distDir = join(viteConfig.root as string, distDir)
    }
    const htmlSource = readFileSync(join(distDir, htmlPath), 'utf8')
    const htmlFunction = await createHtmlFunction(htmlSource, scope, config)
    handler = (_: Record<string, unknown>, reply: Record<string, unknown>) => {
      return htmlFunction.call(reply) as Promise<string | NodeJS.ReadableStream>
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
      async handler(req: Record<string, unknown>, reply: Record<string, unknown>) {
        return (reply as unknown as { send: (data: unknown) => void }).send(
          await (route.getData as (ctx: Record<string, unknown>) => unknown)(
            (req as Record<string, unknown>).route as Record<string, unknown>,
          ),
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
