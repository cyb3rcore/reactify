import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export interface RscContext {
  req: FastifyRequest
  reply: FastifyReply
  server: FastifyInstance
  params?: Record<string, string>
}

// Guard AsyncLocalStorage so the module loads in the browser without crashing.
// Dynamic import of node:async_hooks is only attempted when we detect Node.js
// (process.release?.name === 'node'), avoiding Vite's externalization error.
// In the browser, a minimal fallback just invokes callbacks synchronously.
interface RscAsyncStorage {
  getStore(): RscContext | undefined
  run<R>(store: RscContext, callback: (...args: unknown[]) => R, ...args: unknown[]): R
}

const rscStore: RscAsyncStorage = await (async () => {
  const isNode = typeof process !== 'undefined' && process.release?.name === 'node'
  if (isNode) {
    const { AsyncLocalStorage } = await import('node:async_hooks')
    return new AsyncLocalStorage<RscContext>()
  }
  return {
    getStore: () => undefined,
    run: <R>(_store: RscContext, fn: (...args: unknown[]) => R, ...args: unknown[]) => fn(...args),
  }
})()

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
