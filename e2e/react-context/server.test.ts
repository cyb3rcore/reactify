import { describe, it, expect } from 'vitest'
import { main } from './server'

describe('react-context', () => {
  it('onEnter runs before RSC render', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<!doctype html>')
      expect(res.body).toContain('__FLIGHT_DATA')
      expect(res.body).toContain('Context bridge test')
    } finally {
      await server.close()
    }
  })

  it('getReq accessible in server component', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/with-req' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<!doctype html>')
      expect(res.body).toContain('__FLIGHT_DATA')
      expect(res.body).toContain('req available')
    } finally {
      await server.close()
    }
  })

  it('getServer returns Fastify instance', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/with-server' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<!doctype html>')
      expect(res.body).toContain('__FLIGHT_DATA')
      expect(res.body).toContain('server available')
    } finally {
      await server.close()
    }
  })

  it('route-level onRequest hook works on RSC route', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/configured' })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.close()
    }
  })

  it('configure hook registers Fastify middleware', async () => {
    const server = await main(true)
    try {
      expect((server as unknown as Record<string, unknown>).testDecorator).toBe('configured')
    } finally {
      await server.close()
    }
  })
})
