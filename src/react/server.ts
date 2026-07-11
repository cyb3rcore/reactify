import type { FastifyInstance } from 'fastify'
import { filePathToRoutePath } from './route-utils.js'

/** Known properties exported by a route page module. */
export interface RouteExports {
  path?: string
  name?: string
  component?: unknown
  layout?: unknown
  getData?: unknown
  getMeta?: unknown
  onEnter?: unknown
  streaming?: unknown
  clientOnly?: unknown
  serverOnly?: unknown
  configure?: unknown
  rsc?: boolean
  onRequest?: unknown
  preParsing?: unknown
  preValidation?: unknown
  preHandler?: unknown
  preSerialization?: unknown
  onError?: unknown
  onSend?: unknown
  onResponse?: unknown
  onTimeout?: unknown
  onRequestAbort?: unknown
}

/** A route entry in the Routes collection. */
type RouteRecord = RouteExports & {
  id?: string
  name?: string
  path?: string
  [key: string]: unknown
}

export class Routes extends Array<RouteRecord> {
  toJSON(): Array<Record<string, unknown>> {
    return this.map((route) => ({
      id: route.id,
      path: route.path,
      name: route.name,
      layout: !!route.layout,
      hasLayout: !!route.layout,
      getData: !!route.getData,
      getMeta: !!route.getMeta,
      onEnter: !!route.onEnter,
      rsc: !!route.rsc,
    }))
  }
}

export function prepareServer(server: FastifyInstance): void {
  // Register multipart/form-data content type parser so Fastify accepts
  // RSC server action requests. @vitejs/plugin-rsc's encodeReply creates
  // FormData payloads for server actions; Fastify rejects multipart by
  // default with "Unsupported Media Type". We buffer the raw body so the
  // RSC handler's convertRequest can attach it to the internal Request.
  server.addContentTypeParser(
    'multipart/form-data',
    { parseAs: 'buffer' },
    (_req: unknown, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => {
      done(null, body)
    },
  )

  let url: string | undefined
  server.decorate('serverURL', { getter: () => url })
  server.addHook('onListen', () => {
    const addr = server.server.address()
    if (!addr) return
    const protocol = (server as unknown as Record<string, unknown>).https ? 'https' : 'http'
    if (typeof addr === 'object') {
      const { address, port } = addr as { address: string; port: number }
      url =
        addr.family === 'IPv6'
          ? `${protocol}://[${address}]:${port}`
          : `${protocol}://${address}:${port}`
    }
  })
  server.decorateRequest('fetchMap', null)
  server.addHook('onRequest', (req, _reply, done) => {
    ;(req as unknown as Record<string, unknown>).fetchMap = new Map()
    done()
  })
  server.addHook('onResponse', (req, _reply, done) => {
    ;(req as unknown as Record<string, unknown>).fetchMap = undefined
    done()
  })
}

export async function createRoutes(
  fromPromise: Promise<{ default: Record<string, unknown> | Array<Record<string, unknown>> }>,
  { param } = { param: /\[([.\w]+\+?)\]/ },
): Promise<Routes> {
  const { default: from } = await fromPromise
  const promises: Promise<RouteRecord>[] = []
  if (Array.isArray(from)) {
    for (const routeDef of from) {
      promises.push(
        getRouteModule(
          (routeDef as Record<string, unknown>).path as string,
          (routeDef as Record<string, unknown>).component as () => Promise<unknown>,
        ).then((routeModule) => ({
          id: (routeDef as Record<string, unknown>).path as string,
          name: ((routeDef as Record<string, unknown>).path ?? routeModule.path) as string,
          path: ((routeDef as Record<string, unknown>).path ?? routeModule.path) as string,
          ...routeModule,
        })),
      )
    }
  } else {
    for (const path of Object.keys(from).sort((a, b) => (a > b ? -1 : 1))) {
      promises.push(
        getRouteModule(path, (from as Record<string, unknown>)[path]).then((routeModule) => {
          const routePath: string = (routeModule.path as string) ?? filePathToRoutePath(path) ?? '/'
          const routeName: string =
            (routeModule.name as string) ??
            path
              .slice(6, -4)
              .replace(param, '')
              .replace(/^\/*|\/*$/g, '')
              .replace(/\//g, '_')

          return {
            id: path,
            name: routeName || 'catch-all',
            path: routePath,
            layout: routeModule.layout as string | undefined,
            ...routeModule,
          }
        }),
      )
    }
  }
  return new Routes(...(await Promise.all(promises)))
}

export function getRouteModuleExports(routeModule: Record<string, unknown>): RouteExports {
  // RSC routes use server components for data fetching, not getData
  if (routeModule.rsc && routeModule.getData) {
    throw new Error(
      `Route exports both rsc: true and getData() — these are mutually exclusive. ` +
      `Use server components for data fetching in RSC routes instead of getData.`,
    )
  }
  return {
    component: routeModule.default,
    layout: routeModule.layout,
    getData: routeModule.getData,
    getMeta: routeModule.getMeta,
    onEnter: routeModule.onEnter,
    streaming: routeModule.streaming,
    clientOnly: routeModule.clientOnly,
    serverOnly: routeModule.serverOnly,
    configure: routeModule.configure,
    rsc: routeModule.rsc as boolean | undefined,
    onRequest: routeModule.onRequest ?? undefined,
    preParsing: routeModule.preParsing ?? undefined,
    preValidation: routeModule.preValidation ?? undefined,
    preHandler: routeModule.preHandler ?? undefined,
    preSerialization: routeModule.preSerialization ?? undefined,
    onError: routeModule.onError ?? undefined,
    onSend: routeModule.onSend ?? undefined,
    onResponse: routeModule.onResponse ?? undefined,
    onTimeout: routeModule.onTimeout ?? undefined,
    onRequestAbort: routeModule.onRequestAbort ?? undefined,
  }
}

async function getRouteModule(_path: string, routeModuleInput: unknown): Promise<RouteExports> {
  if (typeof routeModuleInput === 'function') {
    const routeModule = await routeModuleInput()
    return getRouteModuleExports(routeModule as Record<string, unknown>)
  }
  return getRouteModuleExports(routeModuleInput as Record<string, unknown>)
}
