import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prepareClient, createErrorHandler, createRoute } from './routing.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { ClientModule } from '../vite/types/client.js'
import type { RuntimeConfig } from '../vite/types/options.js'

// ---------------------------------------------------------------------------
// prepareClient
// ---------------------------------------------------------------------------
describe('prepareClient', () => {
  it('resolves promise-based context, routes, create', async () => {
    const contextValue = { getData: true }
    const routesValue = [{ path: '/' }, { path: '/about' }]
    const createValue = vi.fn()

    const entries = {
      ssr: {
        context: Promise.resolve(contextValue) as unknown as Record<string, unknown>,
        routes: Promise.resolve(routesValue) as unknown as Iterable<
          import('../vite/types/route.js').RouteDefinition
        >,
        create: Promise.resolve({ default: createValue }) as unknown as (
          ...args: never[]
        ) => unknown,
      },
      rsc: undefined,
    }

    const client = await prepareClient(entries as never)
    expect(client.context).toBe(contextValue)
    expect(client.routes).toBe(routesValue)
    expect(client.create).toBe(createValue)
  })

  it('attaches RSC handler from entries.rsc', async () => {
    const rscHandler = { fetch: vi.fn() }
    const entries = {
      ssr: {
        context: {},
        routes: [],
        create: vi.fn(),
      },
      rsc: rscHandler,
    }

    const client = await prepareClient(entries as never)
    expect(client.rscHandler).toBe(rscHandler)
  })

  it('handles non-promise values directly', async () => {
    const contextValue = { simple: true }
    const routesValue = [{ path: '/' }]
    const createValue = vi.fn()

    const entries = {
      ssr: {
        context: contextValue,
        routes: routesValue,
        create: createValue,
      },
    }

    const client = await prepareClient(entries as unknown as never)
    expect(client.context).toBe(contextValue)
    expect(client.routes).toBe(routesValue)
    expect(client.create).toBe(createValue)
  })
})

// ---------------------------------------------------------------------------
// createErrorHandler
// ---------------------------------------------------------------------------
describe('createErrorHandler', () => {
  function makeScope(): FastifyInstance {
    return { log: { error: vi.fn() } } as unknown as FastifyInstance
  }

  it('returns 500 HTML page in dev mode', async () => {
    const scope = makeScope()
    const config = { dev: true } as RuntimeConfig
    const handler = createErrorHandler({}, scope, config)
    const mockReq = { raw: {}, log: { error: vi.fn() } } as unknown as FastifyRequest
    const reply = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as FastifyReply

    const error = new Error('test error')
    await handler(error, mockReq, reply)

    expect(mockReq.log.error).toHaveBeenCalledWith(error)
    expect(reply.code).toHaveBeenCalledWith(500)
    expect(reply.type).toHaveBeenCalledWith('text/html')
    expect(reply.send).toHaveBeenCalled()
  })

  it('returns empty 500 in production mode', async () => {
    const scope = makeScope()
    const config = { dev: false } as RuntimeConfig
    const handler = createErrorHandler({}, scope, config)
    const mockReq = { raw: {}, log: { error: vi.fn() } } as unknown as FastifyRequest
    const reply = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as FastifyReply

    await handler(new Error('prod error'), mockReq, reply)

    expect(reply.code).toHaveBeenCalledWith(500)
    expect(reply.send).toHaveBeenCalledWith('')
  })
})

// ---------------------------------------------------------------------------
// createRoute
// ---------------------------------------------------------------------------
describe('createRoute', () => {
  let scope: { route: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }
  let client: ClientModule
  let config: RuntimeConfig

  beforeEach(() => {
    scope = {
      route: vi.fn(),
      get: vi.fn(),
    }
    client = {
      routes: [{ path: '/' }, { path: '/about' }] as never[],
      context: {},
      create: vi.fn().mockReturnValue('app'),
      rscHandler: undefined,
    } as unknown as ClientModule
    config = { dev: true } as RuntimeConfig
  })

  it('calls route.configure if provided', async () => {
    const configure = vi.fn()
    const route = { path: '/test', configure }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(configure).toHaveBeenCalledWith(scope)
  })

  it('registers a route with scope.route', async () => {
    const route = { path: '/test' }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.route).toHaveBeenCalledTimes(1)
    const callArgs = scope.route.mock.calls[0][0]
    // Fastify-compatible wildcard path
    expect(callArgs.url).toBe('/test')
    expect(callArgs.method).toEqual(['GET', 'POST', 'PUT', 'DELETE'])
    expect(callArgs.handler).toBeDefined()
    expect(callArgs.errorHandler).toBeDefined()
    expect(callArgs.onRequest).toBeDefined()
    expect(callArgs.preHandler).toBeDefined()
  })

  it('registers companion _.rsc route for RSC routes', async () => {
    const route = { path: '/rsc-page', rsc: true }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.route).toHaveBeenCalledTimes(2)
    const companion = scope.route.mock.calls[1][0]
    expect(companion.url).toBe('/rsc-page_.rsc')
    expect(companion.method).toEqual(['GET', 'POST'])
  })

  it('registers getData JSON endpoint when getData is provided', async () => {
    const getData = vi.fn().mockResolvedValue({ message: 'hello' })
    const route = { path: '/', getData }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.get).toHaveBeenCalledTimes(1)
    const getCall = scope.get.mock.calls[0]
    expect(getCall[0]).toBe('/-/data/')
  })

  it('does not register getData endpoint without getData', async () => {
    const route = { path: '/no-data' }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.get).not.toHaveBeenCalled()
  })

  it('does not register _.rsc companion for non-RSC routes', async () => {
    const route = { path: '/normal' }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.route).toHaveBeenCalledTimes(1)
  })

  it('replaces :param+ with wildcard *', async () => {
    const route = { path: '/docs/:slug+' }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.route.mock.calls[0][0].url).toBe('/docs/*')
  })

  it('preserves :param* as-is (Fastify-native wildcard)', async () => {
    const route = { path: '/docs/:slug*' }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.route.mock.calls[0][0].url).toBe('/docs/:slug*')
  })

  it('creates onRequest handler that sets req.route', async () => {
    const route = { path: '/test' }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )

    // Extract the onRequest handler
    const { onRequest } = scope.route.mock.calls[0][0]
    expect(onRequest).toBeDefined()
    expect(Array.isArray(onRequest)).toBe(true)
    expect(onRequest.length).toBe(1)
  })

  it('handles custom route method', async () => {
    const route = { path: '/api', method: 'POST' }
    await createRoute(
      { client, errorHandler: vi.fn(), route: route as never },
      scope as unknown as FastifyInstance,
      config,
    )
    expect(scope.route.mock.calls[0][0].method).toBe('POST')
  })
})
