/**
 * SSR Entry — RSC stream to HTML generator.
 *
 * Reads the RSC flight payload from a server response and produces a
 * full HTML document with embedded RSC hydration scripts.
 * Replaces react-router's `routeRSCServerRequest` + `RSCStaticRouter`
 * with inline code that reads the payload via `createFromReadableStream`
 * and renders the matched element directly.
 *
 * @module
 */
import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr'
import { renderToReadableStream } from 'react-dom/server'
import { createHead, transformHtmlTemplate } from '@unhead/react/server'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import * as devalue from 'devalue'
import { RouteProvider, type RouteDef } from './core.js'
import { RouteRenderer } from './root.js'
import type { RscPayload } from './rsc-content.js'

/**
 * Load the index.html template for the HTML document shell.
 * Tries the Vite client root first, falls back to a hardcoded template.
 */
function loadHtmlTemplate(): string {
  const isDev = import.meta.env.DEV
  const candidates = isDev
    ? [
        join(process.cwd(), 'src', 'client', 'index.html'),
        join(process.cwd(), 'client', 'index.html'),
        'client/index.html',
        join(process.cwd(), 'client', 'dist', 'client', 'index.html'),
        join(process.cwd(), 'index.html'),
        'index.html',
      ]
    : [
        join(process.cwd(), 'src', 'client', 'index.html'),
        join(process.cwd(), 'client', 'dist', 'client', 'index.html'),
        join(process.cwd(), 'client', 'index.html'),
        'client/index.html',
        join(process.cwd(), 'index.html'),
        'index.html',
      ]
  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        let template = readFileSync(path, 'utf-8')
        // Inject the Vite React Refresh preamble into any loaded HTML template.
        // Vite's transformIndexHtml doesn't apply to server-generated responses
        // (only to HTML files served through Vite's dev server middleware).
        // Without this inline script, @vitejs/plugin-react's $RefreshSig$()
        // wrapper throws during ESM evaluation and mount.tsx never runs.
        const preamble =
          '<script>window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(t)=>t</script>'
        // Inject before </body> — same position as the fallback template.
        // Must run synchronously before <script type="module"> evaluates.
        template = template.replace('</body>', preamble + '\n</body>')
        return template
      }
    } catch {
      // continue to next candidate
    }
  }
  // Fallback template
  // NOTE: The inline script below sets @vitejs/plugin-react's preamble flags
  // BEFORE the $app/mount.js module script executes. ESM evaluates all imports
  // before the module body runs, so virtual modules imported by mount.js (e.g.
  // core.tsx, root.tsx) would otherwise see ___vite_plugin_react_preamble_installed__
  // as undefined and throw. The inline script runs synchronously during HTML
  // parsing, before any module scripts load.
  return '<!doctype html>\n<html lang="en">\n  <head>\n    <title></title>\n  </head>\n  <body>\n    <div id="root"><!-- element --></div>\n<script>window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(t)=>t</script>\n    <script type="module" src="/$app/mount.js"></script>\n  </body>\n</html>'
}

/**
 * Escape HTML script content to prevent `</script>` and `<!--` from
 * breaking the page. Matches the escaping used by rsc-html-stream/server.
 */
function escapeScript(script: string): string {
  return script.replace(/<!--/g, '<\\!--').replace(/<\/(script)/gi, '</\\$1')
}

/**
 * Read the RSC flight data from a ReadableStream body and produce
 * `__FLIGHT_DATA` injection scripts for client-side hydration.
 * Matches the encoding used by rsc-html-stream/server's injectRSCPayload.
 */
async function readRSCPayload(rscBody: ReadableStream<Uint8Array>): Promise<string> {
  const reader = rscBody.getReader()
  const rscDecoder = new TextDecoder('utf-8', { fatal: true })
  let scripts = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    try {
      const str = rscDecoder.decode(value, { stream: true })
      scripts += `<script>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${JSON.stringify(str)})`)}</script>\n`
    } catch {
      // Binary data — encode as base64 with Uint8Array reconstruction
      const b64 = btoa(String.fromCodePoint(...value))
      const encoded = `Uint8Array.from(atob(${JSON.stringify(b64)}), m => m.codePointAt(0))`
      scripts += `<script>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${encoded})`)}</script>\n`
    }
  }
  const remaining = rscDecoder.decode()
  if (remaining.length) {
    scripts += `<script>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${JSON.stringify(remaining)})`)}</script>\n`
  }

  return scripts
}

/**
 * Generate a full HTML document from an RSC server response.
 *
 * This replaces react-router's `routeRSCServerRequest` + `RSCStaticRouter`:
 * - Reads the RSC payload directly from `serverResponse.body` via
 *   `createFromReadableStream`
 * - Extracts the matched route element from `payload.matches[0].element`
 * - Renders it to an HTML stream with head metadata injection, bootstrap
 *   scripts, and RSC flight data scripts for client-side hydration
 *
 * @param request - The original HTTP request (for signal and context)
 * @param serverResponse - The RSC flight response from rsc-entry's handler
 * @returns A streaming HTML Response
 */
export async function generateHTML(
  request: Request,
  serverResponse: Response,
  routes: RouteDef[],
): Promise<Response> {
  // Handle redirects — pass through if the RSC response is a redirect
  if (serverResponse.status >= 300 && serverResponse.status < 400) {
    return serverResponse
  }

  // Read the RSC flight data for client-side hydration scripts.
  // Clone first so the original body is available for createFromReadableStream.
  let rscPayloadScripts = ''
  try {
    const clone = serverResponse.clone()
    rscPayloadScripts = await readRSCPayload(clone.body!)
  } catch (err: unknown) {
    console.error('[ssr-entry] Failed to read RSC payload', err)
  }

  const el = '<!-- element -->'
  const indexHtml = loadHtmlTemplate()
  const [templateBefore = '', templateAfter = ''] = indexHtml.split(el)

  const bootstrapScriptContent = await import.meta.viteRsc.loadBootstrapScriptContent('index')

  // Read the RSC payload for the SSR render
  const rscPayload = await createFromReadableStream<RscPayload>(serverResponse.body!)
  const resolvedPromise = Promise.resolve(rscPayload)

  // Create unhead instance and push head metadata from getMeta
  const head = createHead()
  if (rscPayload?.head) {
    head.push(rscPayload.head)
  }

  // Render the matched element, wrapped in RouteProvider + RouteRenderer for SSR
  // Pass the RSC payload as initialPayload — the client receives this via
  // __FLIGHT_DATA and uses it for hydration (not a promise-based approach
  // that would cause Suspense remount loops).
  const htmlStream = await renderToReadableStream(
    createElement(RouteProvider, {
      routes,
      location: request.url,
      children: createElement(RouteRenderer, { initialPayload: rscPayload }),
    }),
    {
      bootstrapScriptContent,
      formState: rscPayload?.formState as import('react-dom/client').ReactFormState | undefined,
      signal: request.signal,
    },
  )

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Inject head metadata into the template start
  const headInjectedBefore = await transformHtmlTemplate(head, templateBefore)

  // Stream the RSC SSR content progressively — emit templateBefore first,
  // then each cleaned HTML chunk, then RSC payload scripts and templateAfter.
  const stream = htmlStream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(headInjectedBefore))
      },
      transform(chunk, controller) {
        const str = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
        // Strip the _R_ bootstrap script — mount.js handles RSC hydration.
        const cleaned = str.replace(/<script id="_R_">.*?<\/script>/g, '')
        controller.enqueue(encoder.encode(cleaned))
      },
      flush(controller) {
        // Inject window.routes so the client can build the route table via
        // hydrateRoutes(routesGlob). Without this, matchRoute returns null
        // for every URL and the data-loading effect crashes on null.route.
        const routesScript = `<script>window.routes = ${devalue.uneval(routes)}</script>\n`
        controller.enqueue(encoder.encode(rscPayloadScripts + routesScript + (templateAfter ?? '')))
      },
    }),
  )

  const htmlHeaders = new Headers(serverResponse.headers)
  htmlHeaders.set('Content-Type', 'text/html')
  return new Response(stream, {
    status: serverResponse.status,
    headers: htmlHeaders,
  })
}
