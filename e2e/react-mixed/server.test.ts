import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeBuildTest } from '../test-utils'
import { main } from './server'

const cwd = import.meta.dirname

let server: Awaited<ReturnType<typeof main>>

beforeAll(async () => {
  server = await main(true)
})

afterAll(async () => {
  await server.close()
})

describe('react-mixed server', () => {
  it('build production bundle', makeBuildTest({ cwd }))

  it('renders non-RSC home page in production mode', async () => {
    const s = await main()
    try {
      const res = await s.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Mixed Mode Home')
    } finally {
      await s.close()
    }
  })

  it('renders RSC page in production mode', async () => {
    const s = await main()
    try {
      const res = await s.inject({ method: 'GET', url: '/rsc-page' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('RSC Page')
    } finally {
      await s.close()
    }
  })

  it('renders non-RSC home page in dev mode', async () => {
    const res = await server.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('Mixed Mode Home')
  })

  it('renders RSC page in dev mode', async () => {
    const res = await server.inject({ method: 'GET', url: '/rsc-page' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('RSC Page')
  })

  it('RSC page includes __FLIGHT_DATA in HTML', async () => {
    const res = await server.inject({ method: 'GET', url: '/rsc-page' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<!doctype html>')
    expect(res.body).toContain('__FLIGHT_DATA')
    expect(res.body).not.toContain('Error:')
  })
})
