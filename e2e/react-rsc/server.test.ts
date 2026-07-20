import { describe, it, expect } from 'vitest'
import { makeBuildTest, makeRscIndexTest } from '../test-utils'
import { main } from './server'

const cwd = import.meta.dirname

describe('react-rsc', () => {
  it('build production RSC bundle', makeBuildTest({ cwd }))

  it(
    'RSC page has __FLIGHT_DATA in HTML',
    makeRscIndexTest({ main, dev: true, pageUrl: '/rsc-page' }),
  )

  it('renders RSC page in production mode', async () => {
    const server = await main()
    try {
      const res = await server.inject({ method: 'GET', url: '/rsc-page' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<!doctype html>')
      expect(res.body).toContain('__FLIGHT_DATA')
      expect(res.body).not.toContain('Error:')
    } finally {
      await server.close()
    }
  })

  it('/rsc-page_.rsc endpoint responds with Flight payload', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/rsc-page_.rsc' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/x-component')
      expect(res.body).toBeDefined()
      expect(res.body.length).toBeGreaterThan(0)
    } finally {
      await server.close()
    }
  })

  it('streaming route returns content without Content-Length header', async () => {
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

  it('RSC page with layout export wraps content in layout', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/rsc-with-layout' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<!doctype html>')
      expect(res.body).toContain('__FLIGHT_DATA')
      expect(res.body).toContain('E2E Layout Header')
      expect(res.body).toContain('E2E Layout Footer')
      expect(res.body).toContain('RSC page with layout')
      expect(res.body).not.toContain('Error:')
    } finally {
      await server.close()
    }
  })
})
