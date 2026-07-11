import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RouteContext from './context.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

function makeMockServer(): FastifyInstance {
  return { version: '5.x' } as unknown as FastifyInstance
}

function makeMockReq(): FastifyRequest {
  return { url: '/test', method: 'GET' } as unknown as FastifyRequest
}

function makeMockReply(): FastifyReply {
  return { sent: false } as unknown as FastifyReply
}

describe('RouteContext', () => {
  describe('constructor', () => {
    it('sets default properties from route definition', () => {
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), {
        path: '/test',
        streaming: true,
        clientOnly: false,
        serverOnly: true,
        getData: true,
        getMeta: false,
        onEnter: true,
      })
      expect(ctx.server).toBeDefined()
      expect(ctx.req).toBeDefined()
      expect(ctx.reply).toBeDefined()
      expect(ctx.app).toBeNull()
      expect(ctx.head).toEqual({})
      expect(ctx.useHead).toBeDefined()
      expect(ctx.actionData).toEqual({})
      expect(ctx.state).toBeNull()
      expect(ctx.data).toBeNull()
      expect(ctx.firstRender).toBe(true)
      expect(ctx.layout).toBeNull()
      expect(ctx.getMeta).toBe(false)
      expect(ctx.getData).toBe(true)
      expect(ctx.onEnter).toBe(true)
      expect(ctx.streaming).toBe(true)
      expect(ctx.clientOnly).toBe(false)
      expect(ctx.serverOnly).toBe(true)
      expect(ctx.error).toBeUndefined()
    })

    it('uses route.data when provided', () => {
      const routeData = { message: 'hello' }
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), {
        path: '/',
        data: routeData,
      })
      expect(ctx.data).toBe(routeData)
    })

    it('sets default boolean flags to false when not provided', () => {
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), { path: '/' })
      expect(ctx.getData).toBe(false)
      expect(ctx.getMeta).toBe(false)
      expect(ctx.onEnter).toBe(false)
      expect(ctx.streaming).toBe(false)
      expect(ctx.clientOnly).toBe(false)
      expect(ctx.serverOnly).toBe(false)
    })
  })

  describe('static create', () => {
    it('creates RouteContext with server, req, reply, route', async () => {
      const ctx = await RouteContext.create(makeMockServer(), makeMockReq(), makeMockReply(), {
        path: '/',
      })
      expect(ctx).toBeInstanceOf(RouteContext)
      expect(ctx.server).toBeDefined()
    })

    it('initializes state from contextInit.state', async () => {
      const ctx = await RouteContext.create(
        makeMockServer(),
        makeMockReq(),
        makeMockReply(),
        { path: '/' },
        { state: () => ({ count: 42 }) },
      )
      expect(ctx.state).toEqual({ count: 42 })
    })

    it('calls contextInit.default with the route context', async () => {
      const defaultFn = vi.fn()
      const ctx = await RouteContext.create(
        makeMockServer(),
        makeMockReq(),
        makeMockReply(),
        { path: '/' },
        { default: defaultFn },
      )
      expect(defaultFn).toHaveBeenCalledWith(ctx)
    })

    it('works without contextInit', async () => {
      const ctx = await RouteContext.create(makeMockServer(), makeMockReq(), makeMockReply(), {
        path: '/',
      })
      expect(ctx.state).toBeNull()
    })
  })

  describe('toJSON', () => {
    it('serializes route context state', () => {
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), {
        path: '/',
        getData: true,
        clientOnly: true,
      })
      ctx.state = { user: 'admin' }
      ctx.data = { items: [] }
      ctx.head = { title: 'Test' }

      const json = ctx.toJSON()
      expect(json).toEqual({
        actionData: {},
        state: { user: 'admin' },
        data: { items: [] },
        head: { title: 'Test' },
        getMeta: false,
        getData: true,
        onEnter: false,
        firstRender: true,
        clientOnly: true,
      })
    })
  })

  describe('static extend', () => {
    const extendedProps = new Set<string>()
    afterEach(() => {
      for (const prop of extendedProps) {
        delete (RouteContext.prototype as unknown as Record<string, unknown>)[prop]
      }
      extendedProps.clear()
    })

    it('adds properties to RouteContext prototype', () => {
      RouteContext.extend({ customMethod: 'hello' })
      extendedProps.add('customMethod')
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), { path: '/' })
      expect((ctx as unknown as Record<string, unknown>).customMethod).toBe('hello')
    })

    it('skips "default" key when extending', () => {
      RouteContext.extend({ default: 'should-be-skipped', otherProp: 'kept' })
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), { path: '/' })
      expect((ctx as unknown as Record<string, unknown>).otherProp).toBe('kept')
    })

    it('skips "data" and "state" keys', () => {
      RouteContext.extend({ data: 'forbidden', state: 'forbidden', allowed: 'ok' })
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), { path: '/' })
      expect((ctx as unknown as Record<string, unknown>).allowed).toBe('ok')
    })

    it('extended properties are writable', () => {
      RouteContext.extend({ score: 0 })
      const ctx = new RouteContext(makeMockServer(), makeMockReq(), makeMockReply(), { path: '/' })
      ;(ctx as unknown as Record<string, unknown>).score = 100
      expect((ctx as unknown as Record<string, unknown>).score).toBe(100)
    })
  })
})
