import { Readable } from 'node:stream'
import { createElement, type ReactNode } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import * as devalue from 'devalue'
import { transformHtmlTemplate } from '@unhead/react/server'
import { createHtmlTemplates } from './templating'
import { RouteProvider, type RouteDef } from './virtual/core'
import { RouteRenderer } from './virtual/root'

export async function onShellReady(app: ReactNode): Promise<Readable | Error> {
  try {
    const stream = await renderToReadableStream(app)
    // ReactDOMServerReadableStream is not a standard Web ReadableStream,
    // but Readable.fromWeb accepts it at runtime. Cast through unknown
    // to bridge the Node.js and Web stream type mismatch.
    return Readable.fromWeb(stream as unknown as import('stream/web').ReadableStream)
  } catch (error) {
    return error as Error
  }
}

export async function onAllReady(app: ReactNode): Promise<Readable | Error> {
  try {
    const stream = await renderToReadableStream(app)
    await stream.allReady
    return Readable.fromWeb(stream as unknown as import('stream/web').ReadableStream)
  } catch (error) {
    return error as Error
  }
}

export async function createRenderFunction({
  routes,
  create,
}: {
  routes: Array<Record<string, unknown>>
  create: (...args: unknown[]) => ReactNode
}): Promise<(this: Record<string, unknown>) => Promise<{ routes: Array<Record<string, unknown>>; context: unknown; body?: Readable }>> {
  const routeMap = Object.fromEntries(routes.map((r) => [r.path as string, r]))
  return async function (this: Record<string, unknown>) {
    const req = this.request as Record<string, unknown>
    if ((req.route as Record<string, unknown>)?.streaming) {
      return createStreamingResponse(req, routes)
    }
    return createResponse(req, routes)
  }
}

/**
 * Standalone SSR render using RouteProvider + RouteRenderer.
 */
export async function renderSSR(
  url: string,
  routes: RouteDef[],
  options?: { bootstrapScripts?: string[] },
): Promise<ReadableStream<Uint8Array>> {
  const stream = await renderToReadableStream(
    createElement(RouteProvider, { routes, location: url, children: createElement(RouteRenderer) }),
    { bootstrapScripts: options?.bootstrapScripts ?? ['/assets/client.js'] },
  )
  return stream
}

async function createStreamingResponse(req, routes) {
  // SSR stream
  const body = await onShellReady(req.route.app)
  return { routes, context: req.route, body }
}

async function createResponse(req, routes) {
  let body
  if (!req.route.clientOnly) {
    // SSR string
    body = await onAllReady(req.route.app)
  }
  return { routes, context: req.route, body }
}

// The return value of this function gets registered as reply.html()
export async function createHtmlFunction(source, _, config) {
  // Creates `universal` and `serverOnly` sets of
  // HTML `beforeElement` and `afterElement` templates
  const templates = createHtmlTemplates(source, config)

  // Registered as reply.html()
  return async function () {
    const { routes, context, body } = await this.render()

    context.useHead.push(context.head)
    this.type('text/html')

    // Use template with client module import removed
    if (context.serverOnly) {
      // Turn off hydration
      context.hydration = ''

      return streamShell(templates.serverOnly, context, body)
    }

    // Embed full hydration script
    context.hydration = `<script>\nwindow.route = ${
      // Server data payload
      devalue.uneval(context.toJSON())
    }\nwindow.routes = ${
      // Universal router payload
      devalue.uneval(routes.toJSON())
    }\n</script>`

    // In all other cases use universal,
    // template which works the same for SSR and CSR.

    if (context.clientOnly) {
      return sendClientOnlyShell(templates.universal, context)
    }

    return streamShell(templates.universal, context, body)
  }
}

export async function sendClientOnlyShell(templates, context) {
  return await transformHtmlTemplate(
    context.useHead,
    `${templates.beforeElement(context)}${templates.afterElement(context)}`,
  )
}

export function streamShell(templates, context, body) {
  return Readable.from(createShellStream(templates, context, body))
}

async function* createShellStream(templates, context, body) {
  yield await transformHtmlTemplate(context.useHead, templates.beforeElement(context))

  for await (const chunk of body) {
    yield await transformHtmlTemplate(context.useHead, chunk.toString())
  }
  yield await transformHtmlTemplate(context.useHead, templates.afterElement(context))
}
