import { describe, it, expect } from 'vitest'
import { convertRequest, sendResponse } from './rsc-handler'

describe('convertRequest', () => {
  it('creates valid Fetch Request from Fastify req', async () => {
    const mockReq: any = {
      url: '/blog/hello',
      method: 'GET',
      headers: { host: 'localhost:4000', accept: 'text/html' },
      protocol: 'http',
      hostname: 'localhost',
    }
    const request = await convertRequest(mockReq)
    expect(request.method).toBe('GET')
    expect(request.url).toBe('http://localhost:4000/blog/hello')
    expect(request.headers.get('accept')).toBe('text/html')
  })

  it('handles POST with body', async () => {
    const body = { title: 'test' }
    const mockReq: any = {
      url: '/action',
      method: 'POST',
      headers: { host: 'localhost:4000', 'content-type': 'application/json' },
      protocol: 'http',
      hostname: 'localhost',
      body,
    }
    const request = await convertRequest(mockReq)
    expect(request.method).toBe('POST')
    const responseBody = await request.json()
    expect(responseBody).toEqual(body)
  })
})

describe('sendResponse', () => {
  it('copies status and headers to reply', async () => {
    let status: number = 0
    let headers: Record<string, string> = {}
    let bodySent: any = null
    const mockReply: any = {
      code: (s: number) => {
        status = s
        return mockReply
      },
      header: (k: string, v: string) => {
        headers = { ...headers, [k]: v }
      },
      send: (b: any) => {
        bodySent = b
      },
    }
    const response = new Response('ok', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
    await sendResponse(mockReply, response)
    expect(status).toBe(200)
    expect(headers['content-type']).toBe('text/html')
    expect(bodySent).toBeTruthy()
  })
})
