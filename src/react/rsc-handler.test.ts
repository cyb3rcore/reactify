import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, it, expect } from 'vitest'
import { convertRequest, sendResponse } from './rsc-handler.js'

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

  it('handles multipart/form-data body', async () => {
    const buffer = Buffer.from('--boundary\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n--boundary--')
    const mockReq: Partial<FastifyRequest> = {
      url: '/action',
      method: 'POST',
      headers: { host: 'localhost:4000', 'content-type': 'multipart/form-data; boundary=boundary' },
      protocol: 'http',
      hostname: 'localhost',
      body: buffer,
    }
    const request = await convertRequest(mockReq as FastifyRequest)
    expect(request.method).toBe('POST')
    // Body should be attached as-is for multipart (buffered by Fastify parser)
    expect(request.body).toBeDefined()
  })

  it('does not include body for GET requests', async () => {
    const mockReq: Partial<FastifyRequest> = {
      url: '/page',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      protocol: 'http',
      hostname: 'localhost',
      body: { should: 'not appear' },
    }
    const request = await convertRequest(mockReq as FastifyRequest)
    expect(request.method).toBe('GET')
    // Body should not be read for GET/HEAD
    const text = await request.text()
    expect(text).toBe('')
  })

  it('attaches Fastify context properties to request', async () => {
    const mockReq: Partial<FastifyRequest> = {
      url: '/rsc',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      protocol: 'http',
      hostname: 'localhost',
    }
    const request = await convertRequest(mockReq as FastifyRequest & { route?: Record<string, unknown> })
    expect((request as unknown as Record<string, unknown>).__valtioState).toBeNull()
    expect((request as unknown as Record<string, unknown>).__server).toBeNull()
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

  it('skips content-length when body is a ReadableStream', async () => {
    const headers: Record<string, string> = {}
    const mockReply = {
      code: (_s: number) => mockReply,
      header: (k: string, v: string) => {
        headers[k.toLowerCase()] = v
      },
      send: (_b: unknown) => {},
    }
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data'))
        controller.close()
      },
    })
    const response = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/plain', 'content-length': '4' },
    })
    await sendResponse(mockReply as unknown as FastifyReply, response)
    // content-length should not be forwarded when body is a ReadableStream
    expect(headers['content-length']).toBeUndefined()
    expect(headers['content-type']).toBe('text/plain')
  })
})
