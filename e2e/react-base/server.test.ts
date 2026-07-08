import { describe, it, expect } from 'vitest'
import { makeBuildTest, makeIndexTest, makeStartFromOutsideTest } from '../test-utils'
import { main } from './server'

const cwd = import.meta.dirname

describe('react-base', () => {
  // Step 1-2: Build test
  it('build production bundle', makeBuildTest({ cwd }))

  // Step 3: SSR index tests
  it('render index page in dev mode', makeIndexTest({ main, dev: true }))
  it('render index page in production mode', makeIndexTest({ main }))

  // Step 4: Start from outside test
  it('start from parent directory', makeStartFromOutsideTest({ main }))

  // Step 5: Dynamic route params
  it('dynamic route params /users/42', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/users/42' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('User: 42')
    } finally {
      await server.close()
    }
  })

  // Step 6: Static route priority
  it('static route takes precedence over dynamic', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/users/settings' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Settings page')
      expect(res.body).not.toContain('User:')
    } finally {
      await server.close()
    }
  })

  // Step 7: 404 for unknown routes
  it('returns 404 for unknown routes', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/unknown' })
      expect(res.statusCode).toBe(404)
    } finally {
      await server.close()
    }
  })

  // Step 8: Layout wraps page content
  it('layout wraps page content', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<main>')
      expect(res.body).toContain('</main>')
    } finally {
      await server.close()
    }
  })

  // Step 9: getData endpoint returns JSON
  it('getData endpoint returns JSON', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/-/data/' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('application/json')
      const body = JSON.parse(res.body)
      expect(body.message).toBe('Hello from getData')
    } finally {
      await server.close()
    }
  })

  // Step 10: getMeta returns head metadata
  it('getMeta returns head metadata', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<title>React base e2e</title>')
    } finally {
      await server.close()
    }
  })

  // Step 11: Non-RSC streaming route
  it('non-RSC streaming route renders with Suspense', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/streaming' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Streaming SSR')
    } finally {
      await server.close()
    }
  })

  // Step 12: Virtual module glob resolution
  it('resolves virtual module glob imports in development', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.close()
    }
  })
})
