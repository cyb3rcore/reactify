import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Convert a Fastify request to a Web Fetch API Request for the RSC handler.
 */
export async function convertRequest(req: FastifyRequest & { route?: Record<string, any> }): Promise<Request> {
  const host = (req.headers as Record<string, string>)?.host ?? req.hostname
  const url = new URL(req.url, `${req.protocol}://${host}`)
  const init: RequestInit & { duplex?: string } = {
    method: req.method,
    headers: new Headers(req.headers as Record<string, string>),
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = (req.headers as Record<string, string>)?.['content-type'] ?? ''
    if (contentType.startsWith('multipart/form-data')) {
      init.body = req.raw as unknown as ReadableStream
      init.duplex = 'half'
    } else if ((req as any).body) {
      const body = typeof (req as any).body === 'string'
        ? (req as any).body
        : JSON.stringify((req as any).body)
      init.body = body
    }
  }
  const request = new Request(url, init as RequestInit)
  // Attach Fastify context for RSC handler
  ;(request as any).__valtioState = req.route?.state ?? null
  ;(request as any).__server = req.route?.server ?? null
  ;(request as any).__req = req
  return request
}

/**
 * Send a Web Fetch API Response through a Fastify reply.
 */
export async function sendResponse(reply: FastifyReply, response: Response): Promise<void> {
  reply.code(response.status)
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === 'content-length' && response.body instanceof ReadableStream) {
      continue
    }
    reply.header(key, value)
  }
  if (response.body) {
    reply.send(response.body)
  } else {
    reply.send()
  }
}
