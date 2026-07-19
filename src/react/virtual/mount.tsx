'use client';

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
 * For RSC pages, the initial flight data is resolved before hydration so the
 * RscSlot receives a resolved payload (not a promise) — avoiding the infinite
 * remount loop caused by use() inside a lazy-loaded component + Suspense.
 */
export async function mount(routes: RouteDef[], rootId = 'root') {
  const targetElem = document.getElementById(rootId)
  if (!targetElem) {
    console.error(`[mount] Root element #${rootId} not found`)
    return
  }

  // Resolve flight data synchronously before hydration so RscSlot receives a
  // resolved payload, avoiding Suspense/use()-based remount loops.
  let initialPayload: RscPayload | null = null
  if (typeof window !== 'undefined' && window.__FLIGHT_DATA) {
    const { rscStream } = await import('rsc-html-stream/client')
    const { createFromReadableStream } = await import('@vitejs/plugin-rsc/browser')
    initialPayload = await createFromReadableStream<RscPayload>(rscStream)
    if (initialPayload.formState !== undefined) {
      ;(globalThis as any).__rsc_formState = initialPayload.formState
    }
  }

  hydrateRoot(
    targetElem,
    <StrictMode>
      <RouteProvider routes={routes} location={window.location.pathname + window.location.search}>
        <RouteRenderer initialPayload={initialPayload} />
      </RouteProvider>
    </StrictMode>,
  )
}

// Self-invoke as module-level entry point
async function bootstrap() {
  if (typeof window === 'undefined') return
  const resolvedRoutes = hydrateRoutes(routesGlob)
  await mount(resolvedRoutes, 'root')
}
bootstrap()
