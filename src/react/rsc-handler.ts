import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Extended Request with runtime properties attached by the RSC handler.
 * These properties bridge Fastify context into the RSC lifecycle
 * and are consumed by rsc-entry.tsx.
 */
export interface RscAttachedRequest extends Request {
  __valtioState?: Record<string, unknown> | null
  __server?: unknown
  __req?: FastifyRequest
  __reply?: FastifyReply
}

/**
 * Convert a Fastify request to a Web Fetch API Request for the RSC handler.
 */
export async function convertRequest(
  req: FastifyRequest & { route?: Record<string, unknown> },
): Promise<Request> {
  const host =
    (req.headers as Record<string, string>)?.host ?? req.hostname
  const url = new URL(req.url, `${req.protocol}://${host}`)
  const init: RequestInit & { duplex?: string } = {
    method: req.method,
    headers: new Headers(req.headers as Record<string, string>),
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType =
      (req.headers as Record<string, string>)?.['content-type'] ?? ''
    if (contentType.startsWith('multipart/form-data')) {
      // Boundary: Node.js IncomingMessage (req.raw) is a Readable
      // but its type doesn't overlap with Web ReadableStream.
      // The runtime value is compatible for Fetch API body usage.
      init.body = req.raw as unknown as ReadableStream
      init.duplex = 'half'
    } else if (req.body) {
      const body =
        typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body)
      init.body = body
    }
  }
  const request = new Request(url, init as RequestInit)
  // Attach Fastify context for RSC handler.
  // These are runtime-only properties not on the Request type.
  ;(request as RscAttachedRequest).__valtioState =
    (req.route?.state as Record<string, unknown> | undefined) ?? null
  ;(request as RscAttachedRequest).__server = req.route?.server ?? null
  ;(request as RscAttachedRequest).__req = req
  ;(request as RscAttachedRequest).__reply = (req.route?.reply as FastifyReply | undefined) ?? undefined
  return request
}

/**
 * Send a Web Fetch API Response through a Fastify reply.
 */
export async function sendResponse(
  reply: FastifyReply,
  response: Response,
): Promise<void> {
  reply.code(response.status)
  for (const [key, value] of response.headers) {
    if (
      key.toLowerCase() === 'content-length' &&
      response.body instanceof ReadableStream
    ) {
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
