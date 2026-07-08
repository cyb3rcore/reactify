import { createHead } from '@unhead/react/server'
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'

interface RouteDef {
  path: string
  data?: Record<string, unknown> | null
  layout?: string
  getMeta?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  getData?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  onEnter?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  streaming?: boolean
  clientOnly?: boolean
  serverOnly?: boolean
}

interface ContextInit {
  state?: () => Record<string, unknown>
  default?: (ctx: RouteContext) => Promise<void>
}

const routeContextInspect = Symbol.for('nodejs.util.inspect.custom')

export default class RouteContext {
  app: unknown = null
  server: FastifyInstance | null = null
  req: FastifyRequest | null = null
  reply: FastifyReply | null = null
  head: Record<string, unknown> = {}
  useHead: ReturnType<typeof createHead> | null = null
  actionData: Record<string, unknown> = {}
  state: Record<string, unknown> | null = null
  data: Record<string, unknown> | null = null
  firstRender: boolean = true
  layout: string | null = null
  getMeta: boolean = false
  getData: boolean = false
  onEnter: boolean = false
  streaming: boolean = false
  clientOnly: boolean = false
  serverOnly: boolean = false
  error: unknown = undefined
  loader: unknown = undefined
  snapshot: unknown = undefined

  static async create(
    server: FastifyInstance,
    req: FastifyRequest,
    reply: FastifyReply,
    route: RouteDef,
    contextInit?: ContextInit,
  ): Promise<RouteContext> {
    const routeContext = new RouteContext(server, req, reply, route)
    if (contextInit) {
      if (contextInit.state) {
        routeContext.state = contextInit.state()
      }
      if (contextInit.default) {
        await contextInit.default(routeContext)
      }
    }
    return routeContext
  }

  constructor(
    server: FastifyInstance,
    req: FastifyRequest,
    reply: FastifyReply,
    route: RouteDef,
  ) {
    this.app = null
    this.server = server
    this.req = req
    this.reply = reply
    this.head = {}
    this.useHead = createHead()
    this.actionData = {}
    this.state = null
    this.data = (route.data as Record<string, unknown> | undefined) ?? null
    this.firstRender = true
    this.layout = route.layout ?? null
    this.getMeta = !!route.getMeta
    this.getData = !!route.getData
    this.onEnter = !!route.onEnter
    this.streaming = !!route.streaming
    this.clientOnly = !!route.clientOnly
    this.serverOnly = !!route.serverOnly
  }

  [routeContextInspect]() {
    return {
      ...this,
      server: { [routeContextInspect]: (): string => '[Server]' },
      req: { [routeContextInspect]: (): string => '[Request]' },
      reply: { [routeContextInspect]: (): string => '[Reply]' },
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      actionData: this.actionData,
      state: this.state,
      data: this.data,
      head: this.head,
      layout: this.layout,
      getMeta: this.getMeta,
      getData: this.getData,
      onEnter: this.onEnter,
      firstRender: this.firstRender,
      clientOnly: this.clientOnly,
    }
  }

  static extend(initial: Record<string, unknown>): void {
    const { default: _, ...extra } = initial
    for (const [prop, value] of Object.entries(extra)) {
      if (prop !== 'data' && prop !== 'state') {
        Object.defineProperty(RouteContext.prototype, prop, {
          value,
          writable: true,
          configurable: true,
          enumerable: false,
        })
      }
    }
  }
}
