import { AsyncLocalStorage } from 'node:async_hooks'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export interface RscContext {
  req: FastifyRequest
  reply: FastifyReply
  server: FastifyInstance
}

const rscStore = new AsyncLocalStorage<RscContext>()

export function getContext(): RscContext | undefined {
  return rscStore.getStore()
}

export function getReq(): FastifyRequest | undefined {
  return rscStore.getStore()?.req
}

export function getReply(): FastifyReply | undefined {
  return rscStore.getStore()?.reply
}

export function getServer(): FastifyInstance | undefined {
  return rscStore.getStore()?.server
}

export { rscStore }
