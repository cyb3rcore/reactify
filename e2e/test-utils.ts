import { expect } from 'vitest'
import type { FastifyInstance } from 'fastify'

export type MainFn = (dev?: boolean) => Promise<FastifyInstance>

export function makeIndexTest({ main, dev }: { main: MainFn; dev?: boolean }) {
  return async () => {
    const server = await main(dev)
    try {
      const res = await server.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toBeDefined()
    } finally {
      await server.close()
    }
  }
}

export function makeRscIndexTest({ main, dev, pageUrl }: { main: MainFn; dev?: boolean; pageUrl: string }) {
  return async () => {
    const server = await main(dev)
    try {
      const res = await server.inject({ method: 'GET', url: pageUrl })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body).toContain('<!doctype html>')
      expect(res.body).toContain('__FLIGHT_DATA')
      expect(res.body).not.toContain('Error:')
    } finally {
      await server.close()
    }
  }
}

export function makeBuildTest({ cwd }: { cwd: string }) {
  return async () => {
    const { createBuilder } = await import('vite')
    const configFile = cwd + '/vite.config.ts'
    const builder = await createBuilder({ configFile })
    await builder.buildApp()
  }
}

export function makeStartFromOutsideTest({ main }: { main: MainFn }) {
  return async () => {
    const originalCwd = process.cwd()
    try {
      process.chdir('..')
      const server = await main(true)
      try {
        const res = await server.inject({ method: 'GET', url: '/' })
        expect(res.statusCode).toBe(200)
      } finally {
        await server.close()
      }
    } finally {
      process.chdir(originalCwd)
    }
  }
}
