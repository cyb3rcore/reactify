import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, it, expect } from 'vitest'
import { convertRequest, sendResponse } from './rsc-handler'

describe('convertRequest', () => {
  it('creates valid Fetch Request from Fastify req', async () => {
    const mockReq: Partial<FastifyRequest> = {
      url: '/blog/hello',
      method: 'GET',
      headers: { host: 'localhost:4000', accept: 'text/html' },
      protocol: 'http',
      hostname: 'localhost',
    }
    const request = await convertRequest(mockReq as FastifyRequest)
    expect(request.method).toBe('GET')
    expect(request.url).toBe('http://localhost:4000/blog/hello')
    expect(request.headers.get('accept')).toBe('text/html')
  })

  it('handles POST with body', async () => {
    const body = { title: 'test' }
    const mockReq: Partial<FastifyRequest> = {
      url: '/action',
      method: 'POST',
      headers: { host: 'localhost:4000', 'content-type': 'application/json' },
      protocol: 'http',
      hostname: 'localhost',
      body,
    }
    const request = await convertRequest(mockReq as FastifyRequest)
    expect(request.method).toBe('POST')
    const responseBody = await request.json()
    expect(responseBody).toEqual(body)
  })
})

describe('sendResponse', () => {
  it('copies status and headers to reply', async () => {
    let status: number = 0
    let headers: Record<string, string> = {}
    let bodySent: unknown = null
    const mockReply = {
      code: (s: number) => {
        status = s
        return mockReply
      },
      header: (k: string, v: string) => {
        headers = { ...headers, [k]: v }
      },
      send: (b: unknown) => {
        bodySent = b
      },
    }
    const response = new Response('ok', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
    await sendResponse(mockReply as unknown as FastifyReply, response)
    expect(status).toBe(200)
    expect(headers['content-type']).toBe('text/html')
    expect(bodySent).toBeTruthy()
  })
})
