import { StrictMode, type ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouteProvider, type RouteDef } from './core.js'
import { RouteRenderer } from './root.js'
import { hydrateRoutes } from '../client.js'
import type { RscPayload } from './rsc-content.js'
import routesGlob from '$app/routes.js'

declare global {
  interface Window {
    __FLIGHT_DATA?: unknown[]
    __rscSetPayloadPromise?: (p: Promise<RscPayload>) => void
    $RefreshReg$?: () => void
    $RefreshSig$?: (type: unknown) => unknown
    __vite_plugin_react_preamble_installed__?: boolean
    __vite_rsc_require__?: (id: string) => unknown
    __webpack_require__?: ((id: string) => unknown) & { u?: () => void }
  }
}

// React Refresh preamble — unchanged
if (typeof window !== 'undefined') {
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type: any) => type
  window.__vite_plugin_react_preamble_installed__ = true
}

// __webpack_require__ polyfill — unchanged (needed for RSC vendor module loading)
if (typeof window !== 'undefined') {
  const wpRequire = '__' + 'webpack_require' + '__'
  if (typeof (globalThis as any)[wpRequire] === 'undefined') {
    ;(globalThis as any)[wpRequire] = (id: string) => {
      if (id.includes('$$cache=')) {
        return (globalThis as any).__vite_rsc_require__(id)
      }
      const cc = '$' + 'cache='
      const cleanId = id.includes(cc) ? id.split(cc)[0] : id
      return (globalThis as any).__vite_rsc_require__(cleanId)
    }
    ;(globalThis as any)[wpRequire].u = () => {}
  }

  const _origViteRscRequire = (globalThis as any).__vite_rsc_require__
  if (_origViteRscRequire) {
    ;(globalThis as any).__vite_rsc_require__ = (id: string) => {
      if (id.includes('$$cache=')) return _origViteRscRequire(id)
      const cacheIdx = id.indexOf('$' + 'cache=')
      if (cacheIdx !== -1) id = id.slice(0, cacheIdx)
      return _origViteRscRequire(id)
    }
  }
}

/**
 * Unified mount function.
 * Always hydrates RouteProvider → RouteRenderer regardless of route type.
 * For RSC pages, the initial flight data decodes in a background promise
 * passed to RouteRenderer → RscSlot. The router is interactive immediately.
 */
export function mount(routes: RouteDef[], rootId = 'root') {
  const targetElem = document.getElementById(rootId)
  if (!targetElem) {
    console.error(`[mount] Root element #${rootId} not found`)
    return
  }

  // Kick off flight data decode as background promise — don't await
  // The rscStream from rsc-html-stream is already fully buffered
  // (all __FLIGHT_DATA <script> tags ran during HTML parsing)
  let initialRscPromise: Promise<RscPayload> | undefined
  if (typeof window !== 'undefined' && window.__FLIGHT_DATA) {
    initialRscPromise = (async () => {
      const { rscStream } = await import('rsc-html-stream/client')
      const { createFromReadableStream } = await import('@vitejs/plugin-rsc/browser')
      const payload = await createFromReadableStream<RscPayload>(rscStream)
      // Store formState for useActionState
      if (payload.formState !== undefined) {
        ;(globalThis as any).__rsc_formState = payload.formState
      }
      return payload
    })()
  }

  // Hydrate immediately — router is interactive from first synchronous paint
  hydrateRoot(
    targetElem,
    <StrictMode>
      <RouteProvider
        routes={routes}
        location={window.location.pathname + window.location.search}
      >
        <RouteRenderer initialRscPromise={initialRscPromise} />
      </RouteProvider>
    </StrictMode>,
  )
}

// Self-invoke as module-level entry point
function bootstrap() {
  if (typeof window === 'undefined') return
  const resolvedRoutes = hydrateRoutes(routesGlob)
  mount(resolvedRoutes, 'root')
}
bootstrap()
