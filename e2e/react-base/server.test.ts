import { describe, it, expect } from 'vitest'
import { makeBuildTest, makeStartFromOutsideTest } from '../test-utils'
import { main } from './server'

const cwd = import.meta.dirname

function makeIndexTest(mainFn: typeof main, dev?: boolean) {
  return async () => {
    const server = await mainFn(dev)
    try {
      const res = await server.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toBeDefined()
      expect(res.headers['content-type']).toBeDefined()
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body).toContain('<!doctype html>')
      expect(res.body).toContain('<main>')
      expect(res.body).toContain('</main>')
    } finally {
      await server.close()
    }
  }
}

describe('react-base', () => {
  it('build production bundle', makeBuildTest({ cwd }))

  it('render index page in dev mode', makeIndexTest(main, true))
  it('render index page in production mode', makeIndexTest(main))

  it('start from parent directory', makeStartFromOutsideTest({ main }))

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

  it('returns 404 for unknown routes', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/unknown' })
      expect(res.statusCode).toBe(404)
    } finally {
      await server.close()
    }
  })

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

  it('streaming route uses chunked transfer (no Content-Length)', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/streaming' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Streaming SSR')
      expect(res.headers['content-length']).toBeUndefined()
    } finally {
      await server.close()
    }
  })


})
