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
import { createElement, type ComponentType, type ReactNode } from 'react'
import type { RouteDef } from '../core-shared.js'
import { matchRoute } from '../router.js'
import { getContext, setSyncContext } from '../rsc-context.js'
import { filePathToRoutePath } from '../route-utils.js'
import type { RscAttachedRequest } from '../rsc-handler.js'
import { isRedirectError } from '../redirect.js'
import routesManifest from '$app/routes.js'
import ValtioHydrator from '$app/valtio-hydrator.js'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Detect errors caused by using React client hooks (useState, useMemo, etc.)
 * inside a Server Component, where those APIs are null.
 *
 * When detected, returns an enhanced error with a clear message suggesting
 * the `'use client'` directive — similar to Next.js's helpful RSC errors.
 * Returns null if the error doesn't match the hook-in-RSC pattern.
 */
export function tryEnhanceRscHookError(error: unknown): Error | null {
  if (!(error instanceof Error)) return null

  const match = error.message.match(/Cannot read properties of null \(reading '(use\w+)'\)/)
  if (!match) return null

  const hookName = match[1]
  const stack = error.stack ?? ''

  // Find the first user-land frame in the stack trace (skip node_modules/react-server-dom etc.)
  const userFrame = stack
    .split('\n')
    .find(
      (line) =>
        line.includes(' at ') &&
        !line.includes('/node_modules/') &&
        !line.includes('react-server-dom-'),
    )

  const componentHint = userFrame ? userFrame.trim() : 'a component'

  const enhanced = [
    `\`${hookName}\` is not available in Server Components.`,
    `Add \`'use client'\` at the top of the file that defines ${componentHint}`,
    `to use client-side React APIs like \`${hookName}\`.`,
    '',
    `Original error: ${error.message}`,
  ].join('\n')

  // Return a new error that preserves the original name and stack trace
  // so renderErrorPage can display the full picture
  const enhancedError = new Error(enhanced)
  enhancedError.name = error.name
  enhancedError.stack = error.stack
  return enhancedError
}

/**
 * Render an HTML error page for development or production.
 *
 * - **Dev mode** (`NODE_ENV !== 'production'`): Shows error name, message,
 *   and full stack trace with a dark-themed styled page.
 * - **Production mode**: Shows a generic "500 — Internal Server Error" page
 *   with no stack traces or file paths.
 *
 * The response status is derived from the error's `.status` property if
 * present (e.g. `Object.assign(new Error('not found'), { status: 404 })`),
 * falling back to 500.
 */
export function renderErrorPage(error: unknown): Response {
  const errorMessage = error instanceof Error ? error.message : String(error) || 'Unknown error'
  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
  let html: string
  if (isDev) {
    const errorName = error instanceof Error ? error.name : 'Error'
    const errorStack = error instanceof Error ? (error.stack ?? '') : ''
    html =
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>500 — ' +
      escapeHtml(errorMessage) +
      '</title>\n<style>\nbody{font-family:ui-monospace,monospace;background:#0d1117;color:#e6edf3;padding:2rem;max-width:960px;margin:0 auto}\nh1{color:#f85149;font-size:1.5rem;border-bottom:1px solid #30363d;padding-bottom:.5rem}\n.summary{margin:1rem 0;padding:1rem;background:#161b22;border-radius:6px;border:1px solid #30363d}\n.stack{background:#161b22;border-radius:6px;border:1px solid #30363d;overflow-x:auto}\n.stack pre{margin:0;padding:1rem;font-size:.85rem;line-height:1.5}\n</style>\n</head>\n<body>\n<h1>500 — ' +
      escapeHtml(errorName) +
      '</h1>\n<div class="summary"><strong>' +
      escapeHtml(errorMessage) +
      '</strong></div>\n<div class="stack"><pre>' +
      escapeHtml(errorStack) +
      '</pre></div>\n</body>\n</html>'
  } else {
    html =
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>500 — Internal Server Error</title>\n</head>\n<body>\n<h1>500 — Internal Server Error</h1>\n</body>\n</html>'
  }
  return new Response(html, {
    status: error instanceof Error && 'status' in error ? (error as any).status || 500 : 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

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

/**
 * Shape of a page module loaded via Vite's import.meta.glob.
 * Each route's lazy() resolves to a module with optional lifecycle exports.
 * Cast at this boundary once; use typed properties everywhere downstream.
 */
interface PageModule {
  default?: ComponentType<Record<string, unknown>>
  getMeta?: (opts: { url: URL }) => Promise<Record<string, unknown>>
  onEnter?: (ctx: Record<string, unknown>) => Promise<Record<string, unknown> | void>
}

/** Runtime check that an import.meta.glob result is a module object, not null/undefined. */
function isPageModule(mod: unknown): mod is PageModule {
  return typeof mod === 'object' && mod !== null
}

interface RouteConfigEntry {
  id: string
  path: string
  lazy: () => Promise<unknown>
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
      // Key exists: we're iterating Object.keys(routesManifest)
      lazy: routesManifest[importPath]!,
    }))
}

/**
 * Extract head metadata (title, meta tags, link tags) from the matched
 * route's page module. The route module can optionally export a `getMeta()`
 * function that returns head metadata.
 */
async function extractHeadMeta(routeId: string, url: URL): Promise<Record<string, unknown> | null> {
  const loader = routesManifest[routeId]
  if (!loader) return null
  try {
    const pageMod = await loader()
    if (!isPageModule(pageMod)) return null
    if (typeof pageMod.getMeta === 'function') {
      return await pageMod.getMeta({ url })
    }
  } catch (err: unknown) {
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
    const pageMod = await loader()
    if (!isPageModule(pageMod)) return null
    if (typeof pageMod.onEnter === 'function') {
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
        getMeta: !!pageMod.getMeta,
        getData: false,
        onEnter: true,
      }
      const result = await pageMod.onEnter(ctx)
      return (result as Record<string, unknown> | undefined) ?? null
    }
  } catch (err: unknown) {
    if (isRedirectError(err)) throw err
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
  // Boundary: request is a standard Request with runtime properties
  // attached by rsc-handler.ts (convertRequest). The RscAttachedRequest
  // interface captures these additional properties so downstream code
  // can access them without repeated casts.
  const rscRequest = request as RscAttachedRequest
  const valtioState = rscRequest.__valtioState
  const renderRequest = parseRenderRequest(request)

  // Set sync context from request so page components can access it via getReq()/getServer()
  if (rscRequest.__req) {
    setSyncContext({
      req: rscRequest.__req,
      server: rscRequest.__server,
      reply: rscRequest.__reply,
      params: (rscRequest.__req as unknown as Record<string, unknown>).params as
        | Record<string, string>
        | undefined,
    } as import('../rsc-context.js').RscContext)
  }

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
      const body = contentType?.startsWith('multipart/form-data')
        ? await request.formData()
        : await request.text()
      temporaryReferences = createTemporaryReferenceSet()
      const args = await decodeReply(body, { temporaryReferences })
      const action = await loadServerAction(renderRequest.actionId)
      try {
        // useActionState in server components: the form action on the
        // client is a plain server reference (without client-side state
        // tracking), so callServer receives [formData] instead of
        // [prevState, formData].  We detect this case and prepend the
        // previous state stored by the useActionState shim.
        const prevState = (globalThis as any).__rsc_lastActionState
        const callArgs =
          Array.isArray(args) && args.length === 1 && prevState !== undefined
            ? [prevState, ...args]
            : args
        const data = await action.apply(null, callArgs)
        returnValue = { ok: true, data }
      } catch (e: unknown) {
        // Redirect errors must propagate — they produce a 302 Response,
        // not a failed action response
        if (isRedirectError(e)) throw e
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
      } catch (e: unknown) {
        // Redirect errors propagate to the outer handler catch block
        if (isRedirectError(e)) throw e
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
    const routeDefs: RouteDef[] = routes.map((r) => ({ id: r.id, path: r.path, rsc: true }))
    const url = new URL(request.url)
    const matchResult = matchRoute(routes, url.pathname)

    // Route not found — 404
    if (!matchResult) {
      return new Response('Not Found', { status: 404 })
    }

    const matchedRoute = matchResult.route as RouteConfigEntry
    // Boundary: matchedRoute.lazy() returns Promise<unknown> from
    // the Vite import.meta.glob result. Validate with isPageModule
    // so downstream code accesses typed properties without assertions.
    const pageModule = await matchedRoute.lazy()
    if (!isPageModule(pageModule)) {
      return new Response('Not Found', { status: 404 })
    }

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
      Object.assign(valtioState, onEnterData)
    }

    // Set global form state for useActionState shim before rendering the
    // page component. The plugin's patchUseActionState shim checks
    // globalThis.__rsc_formState so server-side useActionState returns the
    // action result rather than the initial state on re-render after an
    // action. This ensures the RSC payload's element tree reflects the
    // updated state.
    if (renderRequest.isAction && returnValue?.ok) {
      ;(globalThis as Record<string, unknown>).__rsc_formState = returnValue.data
      ;(globalThis as Record<string, unknown>).__rsc_lastActionState = returnValue.data
    } else if (formState !== undefined) {
      ;(globalThis as Record<string, unknown>).__rsc_formState = formState
    }

    // Create a React element from the route module's default export.
    // pageModule is narrowed to PageModule by the isPageModule guard above,
    // so default is already ComponentType<...> | undefined.
    const element: ReactNode = pageModule.default
      ? createElement(pageModule.default, { params: matchResult.params })
      : null

    // Do NOT clear __rsc_formState here — the element created above is a
    // React element (createElement does NOT invoke the component function).
    // The component runs lazily during renderToReadableStream below, so
    // the shim's own clearing-on-read is sufficient.
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
    const firstMatch = rscPayload.matches?.[0]
    if (valtioState && firstMatch?.element) {
      const { snapshot, getVersion } = await import('valtio')
      const stateSnapshot =
        getVersion(valtioState) !== undefined ? snapshot(valtioState) : valtioState
      rscPayload.matches![0]!.element = (
        <ValtioHydrator state={stateSnapshot}>{firstMatch.element}</ValtioHydrator>
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
    const ssrEntry = await import.meta.viteRsc.import<{
      generateHTML: (
        request: Request,
        rscResponse: Response,
        routes: RouteDef[],
      ) => Promise<Response>
    }>('./ssr-entry.js', { environment: 'ssr' })
    const htmlResult = await ssrEntry.generateHTML(request, rscResponse.clone(), routeDefs)

    // Defensive guard: catch empty-body responses early
    if (!htmlResult.body) {
      const body = await htmlResult.text()
      throw new Error(`RSC SSR response has no body (status ${htmlResult.status}): ${body}`)
    }

    return htmlResult
  } catch (error: unknown) {
    // Detect redirect errors — return a 3xx Response instead of rendering
    if (isRedirectError(error)) {
      return new Response(null, {
        status: error.status,
        headers: { Location: error.location },
      })
    }

    // Enhance hook-in-RSC errors with 'use client' guidance (dev only)
    const enhancedError = tryEnhanceRscHookError(error)
    const displayError = enhancedError ?? error

    // Log the error for server-side debugging
    const loggable =
      error instanceof Error
        ? `${error.constructor.name}: ${error.message}\n${error.stack?.split('\n').slice(0, 4).join('\n')}`
        : String(error)
    console.error('[rsc-entry] handler error:', loggable)

    return renderErrorPage(displayError)
  }
}

export default { fetch: handler }

if (import.meta.hot) {
  import.meta.hot.accept()
}
