// Vite environment types + RSC plugin runtime extensions on import.meta
interface ImportMeta {
  env: {
    SSR: boolean
    [key: string]: unknown
  }
  glob(pattern: string): Record<string, () => Promise<unknown>>
  globEager(pattern: string): Record<string, unknown>
  readonly viteRsc: {
    import: <T>(specifier: string, options: { environment: string }) => Promise<T>
    loadModule: <T>(environmentName: string, entryName?: string) => Promise<T>
    loadBootstrapScriptContent: (entryName: string) => Promise<string>
  }
  readonly hot?: {
    accept(): void
    accept(path: string): void
    accept(path: string, cb: (mod: unknown) => void): void
    dispose(cb: (data: unknown) => void): void
    invalidate(): void
  }
}

// Window extensions for React hydration
interface Window {
  route: Record<string, unknown>
  routes: Array<Record<string, unknown>>
  __FLIGHT_DATA?: unknown[]
}

// @unhead/react with query parameter
declare module '@unhead/react/server?server' {
  import type { ComponentType, ReactNode } from 'react'
  export const UnheadProvider: ComponentType<{ value: unknown; children?: ReactNode }>
}

// RouteContext has a static extend() method added after class definition
declare module './react/context.js' {
  import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

  interface _RouteDef {
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

  interface _ContextInit {
    state?: () => Record<string, unknown>
    default?: (ctx: RouteContext) => Promise<void>
  }

  class RouteContext {
    constructor(server: FastifyInstance, req: FastifyRequest, reply: FastifyReply, route: _RouteDef)
    static create(
      server: FastifyInstance,
      req: FastifyRequest,
      reply: FastifyReply,
      route: _RouteDef,
      contextInit?: _ContextInit,
    ): Promise<RouteContext>
    static extend(initial: Record<string, unknown>): void
  }

  export default RouteContext
}
