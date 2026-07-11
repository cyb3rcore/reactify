import { describe, it, expect, vi } from 'vitest'
import { Routes, getRouteModuleExports, prepareServer, createRoutes } from './server.js'
import type { FastifyInstance } from 'fastify'

describe('Routes', () => {
  it('extends Array', () => {
    const routes = new Routes()
    expect(routes).toBeInstanceOf(Array)
    expect(routes).toBeInstanceOf(Routes)
  })

  it('toJSON serializes route metadata', () => {
    const routes = new Routes(
      {
        id: '/about',
        path: '/about',
        name: 'about',
        getData: true,
        getMeta: false,
        onEnter: false,
        layout: undefined,
      },
      {
        id: '/users/[id]',
        path: '/users/[id]',
        name: 'user',
        getData: false,
        getMeta: true,
        onEnter: false,
        layout: 'auth',
      },
      {
        id: '/',
        path: '/',
        name: 'home',
        getData: false,
        getMeta: false,
        onEnter: true,
        layout: undefined,
      },
    )
    const json = routes.toJSON()
    expect(json).toHaveLength(3)
    expect(json[0]).toEqual({
      id: '/about',
      path: '/about',
      name: 'about',
      layout: false,
      hasLayout: false,
      getData: true,
      getMeta: false,
      onEnter: false,
      rsc: false,
    })
    expect(json[1]).toEqual({
      id: '/users/[id]',
      path: '/users/[id]',
      name: 'user',
      layout: true,
      hasLayout: true,
      getData: false,
      getMeta: true,
      onEnter: false,
      rsc: false,
    })
    expect(json[2]).toEqual({
      id: '/',
      path: '/',
      name: 'home',
      layout: false,
      hasLayout: false,
      getData: false,
      getMeta: false,
      onEnter: true,
      rsc: false,
    })
  })

  it('toJSON returns empty array for empty Routes', () => {
    const routes = new Routes()
    expect(routes.toJSON()).toEqual([])
  })

  it('Routes is spreadable into Array', () => {
    const routes = new Routes({ id: '/a', path: '/a', name: 'a' })
    const arr = [...routes]
    expect(arr).toHaveLength(1)
    expect(arr[0].id).toBe('/a')
  })
})

describe('getRouteModuleExports', () => {
  it('extracts known properties from a route module', () => {
    const mod = {
      default: 'ComponentFn',
      layout: 'AuthLayout',
      getData: async () => ({}),
      getMeta: async () => ({}),
      onEnter: async () => ({}),
      streaming: true,
      clientOnly: false,
      serverOnly: true,
      configure: () => {},
      rsc: true,
    }
    const result = getRouteModuleExports(mod as Record<string, unknown>)
    expect(result.component).toBe('ComponentFn')
    expect(result.layout).toBe('AuthLayout')
    expect(result.getData).toBe(mod.getData)
    expect(result.getMeta).toBe(mod.getMeta)
    expect(result.onEnter).toBe(mod.onEnter)
    expect(result.streaming).toBe(true)
    expect(result.clientOnly).toBe(false)
    expect(result.serverOnly).toBe(true)
    expect(result.configure).toBe(mod.configure)
    expect(result.rsc).toBe(true)
  })

  it('handles modules with no lifecycle hooks', () => {
    const mod = { default: 'SimplePage' }
    const result = getRouteModuleExports(mod as Record<string, unknown>)
    expect(result.component).toBe('SimplePage')
    expect(result.getData).toBeUndefined()
    expect(result.getMeta).toBeUndefined()
    expect(result.onEnter).toBeUndefined()
    expect(result.rsc).toBeUndefined()
  })

  it('picks up onRequest and other Fastify hooks', () => {
    const onRequest = vi.fn()
    const mod = { default: 'Page', onRequest }
    const result = getRouteModuleExports(mod as Record<string, unknown>)
    expect(result.onRequest).toBe(onRequest)
    expect(result.preParsing).toBeUndefined()
  })

  it('returns undefined rsc when absent', () => {
    const result = getRouteModuleExports({ default: 'Page' })
    expect(result.rsc).toBeUndefined()
  })
})

describe('createRoutes', () => {
  it('resolves routes from an array of definitions', async () => {
    const pageA = { default: 'ComponentA', getData: true }
    const pageB = { default: 'ComponentB' }
    const fromPromise = Promise.resolve({
      default: [
        { path: '/a', component: () => Promise.resolve(pageA) },
        { path: '/b', component: () => Promise.resolve(pageB) },
      ],
    })
    const routes = await createRoutes(fromPromise)
    expect(routes).toHaveLength(2)
    expect(routes[0].id).toBe('/a')
    expect(routes[0].path).toBe('/a')
    expect(routes[1].id).toBe('/b')
    expect(routes[1].path).toBe('/b')
  })

  it('resolves routes from an object of lazy imports', async () => {
    const pageA = { default: 'ComponentA' }
    const fromPromise = Promise.resolve({
      default: {
        '/pages/index.jsx': () => Promise.resolve(pageA),
        '/pages/about.jsx': { default: 'AboutPage' },
      },
    })
    const routes = await createRoutes(fromPromise)
    expect(routes).toHaveLength(2)
  })

  it('throws on empty input', async () => {
    const fromPromise = Promise.resolve({ default: [] })
    const routes = await createRoutes(fromPromise)
    expect(routes).toHaveLength(0)
  })

  it('handles single route', async () => {
    const pageA = { default: 'SinglePage' }
    const fromPromise = Promise.resolve({
      default: [{ path: '/', component: () => Promise.resolve(pageA) }],
    })
    const routes = await createRoutes(fromPromise)
    expect(routes).toHaveLength(1)
    expect(routes[0].id).toBe('/')
    expect(routes[0].path).toBe('/')
  })
})

describe('prepareServer', () => {
  it('registers multipart content type parser', () => {
    const addContentTypeParser = vi.fn()
    const decorate = vi.fn()
    const decorateRequest = vi.fn()
    const addHook = vi.fn()
    const server = {
      addContentTypeParser,
      decorate,
      decorateRequest,
      addHook,
      server: { address: () => ({ address: '127.0.0.1', port: 3000, family: 'IPv4' }) },
    } as unknown as FastifyInstance

    prepareServer(server)

    expect(addContentTypeParser).toHaveBeenCalledWith(
      'multipart/form-data',
      { parseAs: 'buffer' },
      expect.any(Function),
    )
    expect(decorate).toHaveBeenCalled()
    expect(decorateRequest).toHaveBeenCalledWith('fetchMap', null)
    expect(addHook).toHaveBeenCalledWith('onRequest', expect.any(Function))
    expect(addHook).toHaveBeenCalledWith('onResponse', expect.any(Function))
  })

  it('registers onListen hook for serverURL', () => {
    const addHook = vi.fn()
    const server = {
      addContentTypeParser: vi.fn(),
      decorate: vi.fn(),
      decorateRequest: vi.fn(),
      addHook,
      server: { address: () => ({ address: '127.0.0.1', port: 3000, family: 'IPv4' }) },
    } as unknown as FastifyInstance

    prepareServer(server)

    // Check onListen hook is registered
    expect(addHook).toHaveBeenCalledWith('onListen', expect.any(Function))
  })

  it('fetchMap is initialized on each request and cleared on response', () => {
    const hooks: Record<string, Function> = {}
    const addHook = vi.fn((name: string, fn: Function) => {
      hooks[name] = fn
    })
    const server = {
      addContentTypeParser: vi.fn(),
      decorate: vi.fn(),
      decorateRequest: vi.fn(),
      addHook,
      server: { address: () => ({ address: '127.0.0.1', port: 3000, family: 'IPv4' }) },
    } as unknown as FastifyInstance

    prepareServer(server)

    // Simulate onRequest
    const req = {} as Record<string, unknown>
    const done1 = vi.fn()
    hooks.onRequest!(req, null, done1)
    expect(req.fetchMap).toBeInstanceOf(Map)
    expect(done1).toHaveBeenCalled()

    // Simulate onResponse
    const done2 = vi.fn()
    hooks.onResponse!(req, null, done2)
    expect(req.fetchMap).toBeUndefined()
    expect(done2).toHaveBeenCalled()
  })
})
