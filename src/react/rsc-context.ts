import { AsyncLocalStorage } from 'node:async_hooks'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export interface RscContext {
  req: FastifyRequest
  reply: FastifyReply
  server: FastifyInstance
  params?: Record<string, string>
}

const rscStore = new AsyncLocalStorage<RscContext>()

/**
 * Shared symbol key for crossing the Vite SSR module boundary.
 * Vite's module runner creates separate module instances, so module-level
 * variables are not shared. Using globalThis with a Symbol.for key ensures
 * the context payload is visible across both the main process and the
 * Vite SSR environment.
 */
const RSC_SYNC_CTX = Symbol.for('reactify.rscContext')

export function setSyncContext(ctx: RscContext | null): void {
  ;(globalThis as unknown as Record<symbol, unknown>)[RSC_SYNC_CTX] = ctx
}

function resolveContext(): RscContext | undefined {
  return (
    rscStore.getStore() ??
    ((globalThis as unknown as Record<symbol, unknown>)[RSC_SYNC_CTX] as RscContext | undefined) ??
    undefined
  )
}

export function getContext(): RscContext | undefined {
  return resolveContext()
}

export function getReq(): FastifyRequest | undefined {
  return resolveContext()?.req
}

export function getReply(): FastifyReply | undefined {
  return resolveContext()?.reply
}

export function getServer(): FastifyInstance | undefined {
  return resolveContext()?.server
}

export function getParams(): Record<string, string> | undefined {
  return resolveContext()?.params
}

export { rscStore }
