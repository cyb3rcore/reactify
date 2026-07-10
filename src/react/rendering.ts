import { Readable } from 'node:stream'
import { createElement, type ReactNode } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import * as devalue from 'devalue'
import { transformHtmlTemplate } from '@unhead/react/server'
import { createHtmlTemplates } from './templating.js'
import { RouteProvider, type RouteDef } from './virtual/core.js'
import { RouteRenderer } from './virtual/root.js'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { RuntimeConfig } from '../vite/types/options.js'

/**
 * Convert a React SSR ReadableStream to a Node.js Readable for Fastify.
 * The double cast (`as unknown as import('stream/web').ReadableStream`) is needed
 * because react-dom's types use a different ReadableStream type than Node.js's
 * stream/web types. In Node.js 24+, ReadableStream from 'stream/web' should be
 * compatible, but React's type declarations haven't caught up.
 * Ref: https://github.com/facebook/react/issues/12345 (stream type mismatch)
 */
function readableFromReactDom(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(stream as unknown as import('stream/web').ReadableStream)
}

export async function onShellReady(app: ReactNode): Promise<Readable | Error> {
  try {
    const stream = await renderToReadableStream(app)
    return readableFromReactDom(stream)
  } catch (error: unknown) {
    if (error instanceof Error) return error
    return new Error(String(error))
  }
}

export async function onAllReady(app: ReactNode): Promise<Readable | Error> {
  try {
    const stream = await renderToReadableStream(app)
    await stream.allReady
    return readableFromReactDom(stream)
  } catch (error: unknown) {
    if (error instanceof Error) return error
    return new Error(String(error))
  }
}

export async function createRenderFunction({
  routes,
  create,
}: {
  routes: Array<Record<string, unknown>>
  create: (...args: unknown[]) => ReactNode
}): Promise<
  (this: FastifyReply) => Promise<{
    routes: Array<Record<string, unknown>>
    context: unknown
    body?: Readable | Error
  }>
> {
  return async function (this: FastifyReply) {
    const req = this.request as unknown as Record<string, unknown>
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

async function createStreamingResponse(
  req: Record<string, unknown>,
  routes: Array<Record<string, unknown>>,
): Promise<{
  routes: Array<Record<string, unknown>>
  context: unknown
  body: Readable | Error | undefined
}> {
  const route = req.route as Record<string, unknown>
  const body = await onShellReady(route.app as ReactNode)
  return { routes, context: route, body }
}

async function createResponse(
  req: Record<string, unknown>,
  routes: Array<Record<string, unknown>>,
): Promise<{
  routes: Array<Record<string, unknown>>
  context: unknown
  body: Readable | Error | undefined
}> {
  let body: Readable | Error | undefined
  const route = req.route as Record<string, unknown>
  if (!route.clientOnly) {
    body = await onAllReady(route.app as ReactNode)
  }
  return { routes, context: route, body }
}

/** Shape of the result from reply.render() — passed through to the HTML function. */
interface RenderResult {
  routes: Array<Record<string, unknown>>
  context: Record<string, unknown>
  body?: Readable | Error | undefined
}

type HtmlTemplateSet = {
  beforeElement: (ctx: Record<string, unknown>) => string
  afterElement: (ctx: Record<string, unknown>) => string
}

// The return value of this function gets registered as reply.html()
export async function createHtmlFunction(
  source: string,
  // scope — unused, kept for signature compatibility with RendererOption
  _scope: FastifyInstance | Record<string, unknown>,
  config: RuntimeConfig | Record<string, unknown>,
): Promise<(this: FastifyReply) => Promise<Readable | string>> {
  // Creates `universal` and `serverOnly` sets of
  // HTML `beforeElement` and `afterElement` templates
  const templates = createHtmlTemplates(source, config as Record<string, unknown>)

  // Registered as reply.html()
  return async function (this: FastifyReply) {
    const result = await this.render() as unknown as RenderResult
    const { routes, context, body } = result

    const useHead = context.useHead as Parameters<typeof transformHtmlTemplate>[0]
    const head = context.head
    useHead.push(head)
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
      devalue.uneval((context as { toJSON(): Record<string, unknown> }).toJSON())
    }\nwindow.routes = ${
      // Universal router payload
      devalue.uneval(
        (routes as unknown as { toJSON(): Record<string, unknown> }).toJSON(),
      )
    }\n</script>`

    // In all other cases use universal,
    // template which works the same for SSR and CSR.
    if (context.clientOnly) {
      return sendClientOnlyShell(templates.universal, context)
    }
    return streamShell(templates.universal, context, body)
  }
}

export async function sendClientOnlyShell(
  templates: HtmlTemplateSet,
  context: Record<string, unknown>,
): Promise<string> {
  return await transformHtmlTemplate(
    context.useHead as Parameters<typeof transformHtmlTemplate>[0],
    `${templates.beforeElement(context)}${templates.afterElement(context)}`,
  )
}

export function streamShell(
  templates: HtmlTemplateSet,
  context: Record<string, unknown>,
  body: Readable | Error | undefined,
): Readable {
  return Readable.from(createShellStream(templates, context, body))
}

async function* createShellStream(
  templates: HtmlTemplateSet,
  context: Record<string, unknown>,
  body: Readable | Error | undefined,
): AsyncGenerator<string> {
  const transformHead = (str: string) =>
    transformHtmlTemplate(
      context.useHead as Parameters<typeof transformHtmlTemplate>[0],
      str,
    )

  yield transformHead(templates.beforeElement(context))

  if (body instanceof Readable) {
    for await (const chunk of body) {
      yield transformHead(chunk.toString())
    }
  }

  // Inject hydration data (window.route, window.routes) before the closing scripts
  // This is required even if the HTML template doesn't have {{hydration}} — without it,
  // client-side SPA navigation fails because hydrateRoutes() has no route metadata.
  if (context.hydration) {
    yield context.hydration as string
  }

  yield transformHead(templates.afterElement(context))
}
