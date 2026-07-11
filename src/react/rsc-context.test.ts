import { describe, it, expect, beforeEach } from 'vitest'
import { getContext, getReq, getReply, getServer, setSyncContext, rscStore } from './rsc-context.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// Clean up global context between tests
beforeEach(() => {
  setSyncContext(null)
})

describe('rsc-context', () => {
  describe('setSyncContext / getContext', () => {
    it('returns undefined when no context is set', () => {
      expect(getContext()).toBeUndefined()
    })

    it('returns context after setSyncContext', () => {
      const mockReq = {} as FastifyRequest
      setSyncContext({ req: mockReq, reply: {} as FastifyReply, server: {} as FastifyInstance })
      const ctx = getContext()
      expect(ctx).toBeDefined()
      expect(ctx!.req).toBe(mockReq)
    })

    it('clears context when set to null', () => {
      setSyncContext({
        req: {} as FastifyRequest,
        reply: {} as FastifyReply,
        server: {} as FastifyInstance,
      })
      setSyncContext(null)
      expect(getContext()).toBeUndefined()
    })

    it('overwrites previous context', () => {
      const req1 = { url: '/first' } as FastifyRequest
      const req2 = { url: '/second' } as FastifyRequest
      setSyncContext({ req: req1, reply: {} as FastifyReply, server: {} as FastifyInstance })
      setSyncContext({ req: req2, reply: {} as FastifyReply, server: {} as FastifyInstance })
      expect(getContext()!.req).toBe(req2)
    })
  })

  describe('getReq', () => {
    it('returns req from context', () => {
      const mockReq = { url: '/test' } as FastifyRequest
      setSyncContext({ req: mockReq, reply: {} as FastifyReply, server: {} as FastifyInstance })
      expect(getReq()).toBe(mockReq)
    })

    it('returns undefined when no context', () => {
      expect(getReq()).toBeUndefined()
    })
  })

  describe('getReply', () => {
    it('returns reply from context', () => {
      const mockReply = { statusCode: 200 } as FastifyReply
      setSyncContext({ req: {} as FastifyRequest, reply: mockReply, server: {} as FastifyInstance })
      expect(getReply()).toBe(mockReply)
    })

    it('returns undefined when no context', () => {
      expect(getReply()).toBeUndefined()
    })
  })

  describe('getServer', () => {
    it('returns server from context', () => {
      const mockServer = { version: '5.x' } as FastifyInstance
      setSyncContext({ req: {} as FastifyRequest, reply: {} as FastifyReply, server: mockServer })
      expect(getServer()).toBe(mockServer)
    })

    it('returns undefined when no context', () => {
      expect(getServer()).toBeUndefined()
    })
  })

  describe('rscStore', () => {
    it('is an AsyncLocalStorage', () => {
      expect(rscStore).toBeDefined()
      expect(typeof rscStore.run).toBe('function')
    })

    it('provides context within run scope', async () => {
      const mockCtx = {
        req: {} as FastifyRequest,
        reply: {} as FastifyReply,
        server: {} as FastifyInstance,
      }
      await rscStore.run(mockCtx, async () => {
        expect(getContext()).toBe(mockCtx)
      })
    })

    it('falls back to global context when AsyncLocalStorage has no store', () => {
      const mockReq = { url: '/als-fallback' } as FastifyRequest
      setSyncContext({ req: mockReq, reply: {} as FastifyReply, server: {} as FastifyInstance })
      // ALScopes don't override, so outside any run() scope, getContext should return the global
      expect(getContext()!.req).toBe(mockReq)
    })

    it('AsyncLocalStorage scope takes precedence over global context', async () => {
      const globalReq = { url: '/global' } as FastifyRequest
      const alsReq = { url: '/als' } as FastifyRequest
      setSyncContext({ req: globalReq, reply: {} as FastifyReply, server: {} as FastifyInstance })
      await rscStore.run(
        { req: alsReq, reply: {} as FastifyReply, server: {} as FastifyInstance },
        async () => {
          expect(getContext()!.req).toBe(alsReq)
        },
      )
      // After scope exits, falls back to global
      expect(getContext()!.req).toBe(globalReq)
    })
  })
})
