import type { FastifyInstance, RouteOptions } from 'fastify'
import type { ClientModule } from './client.js'

/**
 * Route definition used by the Vite plugin system to register routes.
 * The index signature allows renderers to attach metadata (getData, getMeta, onEnter, etc.)
 * — those renderer-specific fields are accessed by the concrete renderer implementation
 * (e.g., routing.ts for React) via a richer subtype.
 */
export interface RouteDefinition extends Partial<RouteOptions> {
  configure?: (scope: FastifyInstance) => void | Promise<void>
  default?: (...args: unknown[]) => unknown
  // Runtime composes/injects the handler (`createRouteHandler`, plus HMR wrappers in dev).
  handler?: never
  path?: string
  // Runtime sets Fastify's `url` during registration (derived from `path`).
  url?: never
  /** Renderers attach metadata here. Access through a subtype with known properties. */
  [key: string]: unknown
}

/** Base args containing client and route, used by route handlers */
export interface ClientRouteArgs {
  client?: ClientModule
  route?: RouteDefinition
}

/** Full args for createRoute including handler and error handler */
export interface CreateRouteArgs
  extends ClientRouteArgs, Pick<RouteOptions, 'handler' | 'errorHandler'> {
  /** client is required for createRoute */
  client: ClientModule
}
