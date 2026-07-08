import { describe, it, expect } from 'vitest'
import { makeBuildTest, makeRscIndexTest } from '../test-utils'
import { main } from './server'

const cwd = import.meta.dirname

describe('react-rsc', () => {
  it('build production RSC bundle', makeBuildTest({ cwd }))

  it('RSC page has __FLIGHT_DATA in HTML', makeRscIndexTest({ main, dev: true, pageUrl: '/rsc-page' }))

  it('RSC page returns _.rsc Flight payload', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/rsc-page_.rsc' })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.close()
    }
  })

  it('streaming response is chunked (no Content-Length)', async () => {
    const server = await main(true)
    try {
      const res = await server.inject({ method: 'GET', url: '/streaming' })
      expect(res.statusCode).toBe(200)
      // Streaming responses should not have Content-Length
      expect(res.headers['content-length']).toBeUndefined()
    } finally {
      await server.close()
    }
  })
})
