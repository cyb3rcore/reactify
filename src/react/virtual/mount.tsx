import { StrictMode, createElement, useState, useEffect, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouteProvider, type RouteDef } from './core.js'
import { RouteRenderer } from './root.js'
import { hydrateRoutes } from '../client.js'
import routesGlob from '$app/routes.js'

declare global {
  interface Window {
    __rscSetPayload?: (v: unknown) => void
    $RefreshReg$?: () => void
    $RefreshSig$?: (type: unknown) => unknown
    __vite_plugin_react_preamble_installed__?: boolean
    __vite_rsc_require__?: (id: string) => unknown
    __webpack_require__?: ((id: string) => unknown) & { u?: () => void }
  }
}

/**
 * Set React Refresh preamble flags at module level.
 *
 * @vitejs/plugin-react injects $RefreshSig$() at the top of any function
 * containing a component definition. hydrateRsc contains RscRoot, so the
 * plugin adds `var _s = $RefreshSig$()` as the very first statement in
 * the function body. We must set the preamble before hydrateRsc is called
 * or the injected call throws "TypeError: $RefreshSig$ is not a function".
 *
 * RSC pages use SSR-generated HTML which does not include the React Refresh
 * preamble script that @vitejs/plugin-react normally injects into HTML via
 * transformIndexHtml (the response is a ReadableStream, bypassing that hook).
 * We set it here instead.
 */
if (typeof window !== 'undefined') {
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type: any) => type
  window.__vite_plugin_react_preamble_installed__ = true
}

/**
 * Hydrate an RSC page using the flight data injected by the server.
 * Follows the pattern from @fastify/react's mount.ts (upstream reference).
 */
async function hydrateRsc(targetElem: Element): Promise<void> {
  const { rscStream } = await import('rsc-html-stream/client')
  const { createFromReadableStream, setServerCallback } = await import('@vitejs/plugin-rsc/browser')

  // Set up __webpack_require__ polyfill for RSC vendor module loading.
  // The react-server-dom vendor file uses a __webpack_require__-based
  // module loading system. Vite's esbuild-based dep pre-bundling skips
  // the rsc:patch-react-server-dom-webpack transform, leaving the
  // pre-bundled vendor file with undefined __webpack_require__.
  //
  // Additionally, the RSC flight data protocol decodes $$ -> $, so the
  // $$cache= tag created by createReferenceCacheTag becomes $cache= after
  // flight data decoding. The internal removeReferenceCacheTag looks for
  // $$cache= and misses it, so we strip $cache= here too.
  const wpRequire = '__' + 'webpack_require' + '__'
  if (typeof (globalThis as any)[wpRequire] === 'undefined') {
    ;(globalThis as any)[wpRequire] = (id: string) => {
      // Only strip $cache= when $$cache= is NOT present — $cache= matches
      // inside $$cache= (at the second $), producing a broken URL.
      if (id.includes('$$cache=')) {
        return (globalThis as any).__vite_rsc_require__(id)
      }
      const cc = '$' + 'cache='
      const cleanId = id.includes(cc) ? id.split(cc)[0] : id
      return (globalThis as any).__vite_rsc_require__(cleanId)
    }
    ;(globalThis as any)[wpRequire].u = () => {}
  }

  // Also strip $cache= tag directly in __vite_rsc_require__ — the
  // __webpack_require__ polyfill above handles calls from the pre-bundled
  // vendor file, but when the rsc:patch-react-server-dom-webpack transform
  // replaces __webpack_require__ directly with __vite_rsc_require__
  // (bypassing the polyfill), $cache= still reaches __vite_rsc_require__.
  const _origViteRscRequire = (globalThis as any).__vite_rsc_require__
  if (_origViteRscRequire) {
    ;(globalThis as any).__vite_rsc_require__ = (id: string) => {
      if (id.includes('$$cache=')) return _origViteRscRequire(id)
      const cacheIdx = id.indexOf('$' + 'cache=')
      if (cacheIdx !== -1) id = id.slice(0, cacheIdx)
      return _origViteRscRequire(id)
    }
  }

  // React Refresh preamble is now set at module level above so that
  // @vitejs/plugin-react's injected $RefreshSig$() call at the top of
  // this function body resolves successfully.

  const initialPayload = await createFromReadableStream(rscStream)

  function RscRoot() {
    const [payload, setPayload] = useState(initialPayload)

    // Store setter for server action callback invocations and
    // register server action callback for initial hydration.
    // RscContent (in rsc-content.jsx) calls setServerCallback only
    // for client-side navigations; for initial page hydration we
    // must register it here.
    useEffect(() => {
      window.__rscSetPayload = (v: unknown) => startTransition(() => setPayload(v))
      setServerCallback(async (id: string, args: unknown[]) => {
        const { createTemporaryReferenceSet, encodeReply, createFromFetch } =
          await import('@vitejs/plugin-rsc/browser')
        const temporaryReferences = createTemporaryReferenceSet()
        const rscUrl = `${window.location.pathname}_.rsc${window.location.search}`
        const payload = await createFromFetch(
          fetch(rscUrl, {
            method: 'POST',
            headers: { 'x-rsc-action': id },
            body: await encodeReply(args, { temporaryReferences }),
          }),
          { temporaryReferences },
        )
        startTransition(() => setPayload(payload))
        const { ok, data } = (payload as any).returnValue ?? {}
        if (!ok) throw data
        return data
      })
    }, [])

    // Apply head metadata from the RSC payload
    useEffect(() => {
      if ((payload as any).head?.title) {
        document.title = (payload as any).head.title
      }
    }, [payload])

    return (payload as any).matches?.[0]?.element ?? null
  }

  // Pass formState as third argument to hydrateRoot
  hydrateRoot(targetElem, createElement(RscRoot), {
    formState: (initialPayload as any).formState,
  })
}

// Track whether we've already auto-hydrated to prevent double initialization.
let _hydrated = false

// Mount entry point. The app entry point (create.tsx or similar) assembles
// the RouteProvider + RouteRenderer with the actual route table.
// This file exports the hydration logic for consumer applications.
export function mount(routes: RouteDef[], rootId = 'root') {
  const targetElem = document.getElementById(rootId)
  if (!targetElem) {
    console.error(`[mount] Root element #${rootId} not found`)
    return
  }

  if (typeof window !== 'undefined' && window.__FLIGHT_DATA) {
    if (!_hydrated) {
      _hydrated = true
      hydrateRsc(targetElem).catch((err) => {
        console.error('[mount] RSC hydration failed:', err)
      })
    }
    return
  }

  // Non-RSC hydration
  hydrateRoot(
    targetElem,
    <StrictMode>
      <RouteProvider routes={routes}>
        <RouteRenderer />
      </RouteProvider>
    </StrictMode>,
  )
}

// Self-invoke as the module-level entry point for $app/mount.js.
// The HTML loads this file via <script type="module" src="$app/mount.js">,
// and ESM top-level execution bootstraps the app. Projects that provide
// their own mount.tsx override this virtual module entirely.

function bootstrap() {
  if (typeof window === 'undefined') return
  if (window.__FLIGHT_DATA) {
    // RSC path: routes not needed — mount() detects __FLIGHT_DATA and
    // calls hydrateRsc() which reads the flight stream for the element tree
    // and registers setServerCallback for server action calls.
    mount([], 'root')
    return
  }
  // Non-RSC path: hydrateRoutes is synchronous (reads window.routes and
  // wraps loaders in React.lazy — no dynamic import is called here).
  // Calling it synchronously before mount() eliminates the async gap where
  // clicks on <a> tags would otherwise cause full page reloads before the
  // RouteProvider's useEffect click handler is registered.
  const resolvedRoutes = hydrateRoutes(routesGlob)
  mount(resolvedRoutes, 'root')
}
bootstrap()
