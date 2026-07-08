/**
 * RSC Entry — server-side RSC request handler.
 *
 * Processes incoming HTTP requests for RSC payloads and server actions.
 * Replaces react-router's `matchRSCServerRequest` with our custom
 * `matchRoute` from `../router` and `getContext` from `../rsc-context`.
 *
 * @module
 */
import {
  renderToReadableStream,
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  decodeAction,
  decodeFormState,
} from '@vitejs/plugin-rsc/rsc'
import { createElement, type ReactNode } from 'react'
import { matchRoute } from '../router'
import { getContext } from '../rsc-context'
import routesManifest from '$app/routes.js'
import ValtioHydrator from '$app/valtio-hydrator.jsx'

/**
 * URL suffix to differentiate RSC requests from SSR requests.
 * RSC requests end with '_.rsc', which is stripped to get the actual URL path.
 */
const URL_POSTFIX = '_.rsc'

/**
 * Header name for passing the server action ID in RSC action requests.
 */
const HEADER_ACTION_ID = 'x-rsc-action'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface RouteConfigEntry {
  id: string
  path: string
  lazy: () => Promise<Record<string, unknown>>
}

interface RenderRequest {
  isRsc: boolean
  isAction: boolean
  actionId?: string
  url: URL
}

interface RscMatchEntry {
  route: { id: string; path: string }
  params: Record<string, string>
  element: ReactNode | null
}

interface RscPayload {
  type: string
  matches: RscMatchEntry[]
  location: { pathname: string; search: string; hash: string }
  loaderData: Record<string, unknown>
  head: unknown | null
  formState: unknown
  returnValue: unknown
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Parse an incoming HTTP request to determine if it's an RSC request,
 * a server action, or a regular document (SSR) request.
 *
 * - Requests ending with `_.rsc` are RSC payload requests
 * - POST requests with `x-rsc-action` header are server action calls
 * - Everything else is a regular document request delegated to SSR
 */
function parseRenderRequest(request: Request): RenderRequest {
  const url = new URL(request.url)
  const isAction = request.method === 'POST'
  if (url.pathname.endsWith(URL_POSTFIX)) {
    url.pathname = url.pathname.slice(0, -URL_POSTFIX.length)
    const actionId = request.headers.get(HEADER_ACTION_ID) || undefined
    return {
      isRsc: true,
      isAction,
      actionId,
      url,
    }
  }
  return { isRsc: false, isAction, url }
}

/**
 * Convert a file path from the routes manifest to a route path string.
 *
 * Examples:
 *   /pages/index.jsx        -> /
 *   /pages/about.jsx        -> /about
 *   /pages/blog/[slug].jsx  -> /blog/:slug
 *   /pages/[...catchAll].jsx -> /:catchAll*
 */
function filePathToRoutePath(filePath: string): string | null {
  let route = filePath.replace(/\.(jsx|tsx|js|ts)$/, '')
  // Strip pages/ or src/pages/ prefix (with or without leading /)
  route = route.replace(/^\/?(pages|src\/pages)\/?/, '/')
  // Handle index routes
  if (route === '' || route === '/index' || route === 'index') return '/'
  route = route.replace(/\/index$/, '')
  // Catch-all [...name] -> :name*
  route = route.replace(/\[\.\.\.(\w+)\]/g, ':$1*')
  // Dynamic params [name] -> :name
  route = route.replace(/\[(\w+)\]/g, ':$1')
  // Ensure leading /
  if (!route.startsWith('/')) route = '/' + route
  return route
}

/**
 * Build an array of RouteConfigEntry objects from the `$app/routes.js`
 * manifest (the `import.meta.glob` result over the pages directory).
 *
 * Routes are sorted in descending order so that static routes take
 * precedence over dynamic ones during matching.
 */
function buildRouteConfig(): RouteConfigEntry[] {
  const importPaths = Object.keys(routesManifest)
  return importPaths
    .sort((a, b) => (a > b ? -1 : 1))
    .map((importPath) => ({
      id: importPath,
      path: filePathToRoutePath(importPath) || '/',
      lazy: routesManifest[importPath],
    }))
}

/**
 * Extract head metadata (title, meta tags, link tags) from the matched
 * route's page module. The route module can optionally export a `getMeta()`
 * function that returns head metadata.
 */
async function extractHeadMeta(
  routeId: string,
  url: URL,
): Promise<Record<string, unknown> | null> {
  const loader = routesManifest[routeId]
  if (!loader) return null
  try {
    const routeModule = await loader()
    if (typeof (routeModule as Record<string, unknown>)?.getMeta === 'function') {
      return await (routeModule as Record<string, unknown>).getMeta({ url })
    }
  } catch (err) {
    console.warn('[rsc-entry] getMeta error:', err)
  }
  return null
}

/**
 * Execute the `onEnter` lifecycle hook from the matched route module.
 * This runs before the server component render, allowing the route to
 * perform data loading, authentication checks, or other side effects.
 *
 * The `onEnter` callback receives a `ctx` object with request context.
 * If it returns data, it's included in the RSC payload as `onEnterData`.
 * Errors are logged but don't crash the render.
 *
 * Uses `getContext()` from `../rsc-context` to access the Fastify request
 * context (server, req, reply) instead of `request.__server` / `request.__req`
 * from the PR branch.
 */
async function extractOnEnter(
  routeId: string,
  requestUrl: URL,
  payload: { matches?: Array<{ params?: Record<string, string> }> },
  state: unknown,
): Promise<Record<string, unknown> | null> {
  const loader = routesManifest[routeId]
  if (!loader) return null
  try {
    const routeModule = await loader()
    const mod = routeModule as Record<string, unknown>
    if (typeof mod?.onEnter === 'function') {
      const leafMatch = payload?.matches?.slice(-1)[0]
      const rscCtx = getContext()
      const ctx: Record<string, unknown> = {
        url: requestUrl,
        params: leafMatch?.params ?? {},
        data: {},
        state: state ?? null,
        server: rscCtx?.server ?? null,
        req: rscCtx?.req ?? null,
        reply: rscCtx?.reply ?? null,
        firstRender: true,
        getMeta: !!mod.getMeta,
        getData: false,
        onEnter: true,
      }
      const result = await (mod.onEnter as (ctx: Record<string, unknown>) => Promise<unknown>)(ctx)
      return (result ?? null) as Record<string, unknown> | null
    }
  } catch (err) {
    console.error('[rsc-entry] onEnter error:', err)
  }
  return null
}

// -------------------------------------------------------------------------
// Handler
// -------------------------------------------------------------------------

/**
 * RSC request handler.
 *
 * Processes incoming HTTP requests, handling three cases:
 * 1. **Server actions** (POST): Decode and execute server functions,
 *    returning updated RSC payload reflecting state changes.
 * 2. **RSC requests** (URL with `_.rsc` suffix): Return an RSC payload
 *    stream containing the server-rendered component tree and head metadata.
 * 3. **Document requests** (no suffix): Delegate to the SSR environment
 *    to produce full HTML with RSC payload embedded for hydration.
 */
async function handler(request: Request): Promise<Response> {
  const valtioState = (request as Record<string, unknown>).__valtioState
  const renderRequest = parseRenderRequest(request)

  // ------------------------------------------------------------------
  // 1. Handle server actions
  // ------------------------------------------------------------------
  let returnValue: { ok: boolean; data: unknown } | undefined
  let formState: unknown
  let temporaryReferences: unknown
  let actionStatus: number | undefined

  if (renderRequest.isAction) {
    if (renderRequest.actionId) {
      // Server action called via React Server Callback
      const contentType = request.headers.get('content-type')
      const body =
        contentType?.startsWith('multipart/form-data')
          ? await request.formData()
          : await request.text()
      temporaryReferences = createTemporaryReferenceSet()
      const args = await decodeReply(body, { temporaryReferences })
      const action = await loadServerAction(renderRequest.actionId)
      try {
        const data = await action.apply(null, args)
        returnValue = { ok: true, data }
      } catch (e) {
        returnValue = { ok: false, data: e }
        actionStatus = 500
      }
    } else {
      // Progressive enhancement: server action via <form action={...}>
      const formData = await request.formData()
      const decodedAction = await decodeAction(formData)
      try {
        const result = await decodedAction()
        formState = await decodeFormState(result, formData)
      } catch {
        return new Response('Internal Server Error', { status: 500 })
      }
    }
  }

  // After action handling, replace request with a GET request so routing
  // skips mutation processing entirely. Also strip the _.rsc suffix from
  // the request URL — parseRenderRequest already parsed it and stored the
  // clean URL in renderRequest.url.
  if (renderRequest.isAction) {
    request = new Request(renderRequest.url, {
      method: 'GET',
      headers: request.headers,
    })
  } else if (renderRequest.isRsc) {
    request = new Request(renderRequest.url, {
      method: request.method,
      headers: request.headers,
    })
  }

  // ------------------------------------------------------------------
  // 2-4. Match, generate RSC response, and produce HTML for document requests
  // ------------------------------------------------------------------
  let rscResponse: Response
  try {
    const routes = buildRouteConfig()
    const url = new URL(request.url)
    const matchResult = matchRoute(routes, url.pathname)

    // Route not found — 404
    if (!matchResult) {
      return new Response('Not Found', { status: 404 })
    }

    const matchedRoute = matchResult.route as RouteConfigEntry
    const routeModule = (await matchedRoute.lazy()) as Record<string, unknown>

    // Execute onEnter and extract head metadata from the matched leaf route
    let head: unknown = null
    let onEnterData: Record<string, unknown> | null = null

    onEnterData = await extractOnEnter(
      matchedRoute.id,
      renderRequest.url,
      { matches: [{ params: matchResult.params }] },
      valtioState,
    )
    head = await extractHeadMeta(matchedRoute.id, renderRequest.url)

    // Fallback: match by URL pathname against routesManifest directly
    // (handles cases where route.id format doesn't align with manifest keys)
    if (!head) {
      const routePath = url.pathname
      for (const [importPath] of Object.entries(routesManifest)) {
        if (filePathToRoutePath(importPath) === routePath) {
          head = await extractHeadMeta(importPath, renderRequest.url)
          break
        }
      }
    }

    // Merge onEnterData into valtioState so client components can read it
    if (onEnterData && valtioState) {
      Object.assign(valtioState as Record<string, unknown>, onEnterData)
    }

    // Create a React element from the route module's default export
    const Component = routeModule.default as
      | React.ComponentType<Record<string, unknown>>
      | undefined
    const element: ReactNode = Component ? createElement(Component) : null

    // Build the RSC payload (analogous to what react-router's RSC router produces)
    const rscPayload: RscPayload = {
      type: 'RSC',
      matches: [
        {
          route: { id: matchedRoute.id, path: matchedRoute.path },
          params: matchResult.params,
          element,
        },
      ],
      location: {
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
      },
      loaderData: {},
      head,
      formState,
      returnValue,
    }

    // Wrap RSC element tree with ValtioHydrator if Valtio state is available
    if (valtioState && rscPayload.matches[0].element) {
      const { snapshot, getVersion } = await import('valtio')
      const stateSnapshot =
        getVersion(valtioState) !== undefined
          ? snapshot(valtioState)
          : valtioState
      rscPayload.matches[0].element = (
        <ValtioHydrator state={stateSnapshot}>
          {rscPayload.matches[0].element}
        </ValtioHydrator>
      )
    }

    const rscOptions = temporaryReferences ? { temporaryReferences } : undefined
    rscResponse = new Response(renderToReadableStream(rscPayload, rscOptions), {
      status: actionStatus ?? 200,
      headers: { 'Content-Type': 'text/x-component' },
    })

    // Return RSC stream for .rsc requests directly
    if (renderRequest.isRsc) {
      return rscResponse
    }

    // Delegate to SSR environment for full document (HTML) requests
    const ssrEntry = await (import.meta as Record<string, any>).viteRsc.import(
      './ssr-entry.jsx',
      { environment: 'ssr' },
    )
    const htmlResult = await ssrEntry.generateHTML(request, rscResponse.clone())

    // Defensive guard: catch empty-body responses early
    if (!htmlResult.body) {
      const body = await htmlResult.text()
      throw new Error(
        `RSC SSR response has no body (status ${htmlResult.status}): ${body}`,
      )
    }

    return htmlResult
  } catch (error) {
    const err = error as Error
    console.error(
      '[rsc-entry] handler error:',
      err?.constructor?.name,
      err?.message,
      err?.stack?.split('\n').slice(0, 4).join('\n'),
    )
    // Render error using Youch (dev error pages) with fallback
    try {
      const { Youch } = await import('youch')
      const youch = new (Youch as any)()
      const html = await youch.toHTML(error, { title: 'RSC Render Error' })
      return new Response(html, {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      })
    } catch {
      const errorText =
        err?.message ??
        (typeof error === 'string'
          ? error
          : String(error) || 'Unknown error')
      return new Response(
        `<html><body><h1>500 — Internal Server Error</h1><pre>${errorText}</pre></body></html>`,
        {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      )
    }
  }
}

export default { fetch: handler }

if ((import.meta as Record<string, any>).hot) {
  ;(import.meta as Record<string, any>).hot.accept()
}
