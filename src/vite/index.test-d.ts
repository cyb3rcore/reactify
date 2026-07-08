import type { Server } from 'node:http'
import Fastify, { type FastifyPluginCallback, type FastifyRequest, type FastifyReply } from 'fastify'
import { describe, expectTypeOf, it } from 'vitest'
import * as ReactifyViteAll from '../index.js'
import ReactifyVite, { reactifyVite, type ReactifyViteOptions } from '../index.js'

const options = {
  root: process.cwd(),
  spa: false,
  async prepareClient(entries) {
    return entries.ssr ?? null
  },
  async createHtmlFunction(source) {
    return function () {
      return this
    }
  },
  async createRenderFunction(client) {
    return function () {
      return { element: '', hydration: '' }
    }
  },
  renderer: {
    createErrorHandler(args, scope, config) {
      return (error: Error, req: FastifyRequest, reply: FastifyReply) => {}
    },
    createRoute(args, scope, config) {},
    createRouteHandler(args, scope, config) {
      return (req, res) => {
        return Promise.resolve()
      }
    },
    prepareClient(entries, scope, config) {
      return Promise.resolve(entries.ssr ?? null)
    },
  },
} satisfies ReactifyViteOptions

describe('test by options', () => {
  it('import default and named exports', () => {
    expectTypeOf<FastifyPluginCallback<ReactifyViteOptions, Server>>(ReactifyVite)
    expectTypeOf<FastifyPluginCallback<ReactifyViteOptions, Server>>(ReactifyViteAll.default)
    expectTypeOf<FastifyPluginCallback<ReactifyViteOptions>>(reactifyVite)
    expectTypeOf(options.createHtmlFunction).parameter(0).toEqualTypeOf('string')
  })
})

const app = Fastify()
app.register(ReactifyVite, {
  root: process.cwd(),
  dev: true,
  spa: false,
})
app.vite.ready()

// fastifyStaticOptions: accepts valid @fastify/static options
app.register(ReactifyVite, {
  root: process.cwd(),
  fastifyStaticOptions: {
    preCompressed: true,
    maxAge: 31536000,
    immutable: true,
  },
})

// @ts-expect-error - root is managed internally and cannot be overridden
app.register(ReactifyVite, {
  root: process.cwd(),
  fastifyStaticOptions: { root: '/bad' },
})

// @ts-expect-error - prefix is managed internally and cannot be overridden
app.register(ReactifyVite, {
  root: process.cwd(),
  fastifyStaticOptions: { prefix: '/bad' },
})
