'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  startTransition,
  type ComponentType,
  type ReactNode,
} from 'react'
import { matchRoute, parseLocation, type ParsedLocation } from '../router.js'
import { findSerializedRouteByFile, createRefreshSequencer } from '../hmr-client.js'
import type { RouteDef, RouteContextValue, RouteProviderProps } from '../core-shared.js'

export type { RouteDef, RouteContextValue, RouteProviderProps } from '../core-shared.js'

const RSC_SYNC_CTX = Symbol.for('reactify.rscContext')
const isServer = typeof window === 'undefined'
const routeMapRef: { current: Record<string, unknown> } = { current: {} }
const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect

const RouterCtx = createContext<RouteContextValue | null>(null)

let routeRefreshHandler:
  | ((
      routeId: string,
      component: ComponentType<Record<string, unknown>>,
      layout: ComponentType<{ children: ReactNode }> | undefined,
    ) => void)
  | null = null
let pendingRouteRefresh:
  | {
      routeId: string
      component: ComponentType<Record<string, unknown>>
      layout: ComponentType<{ children: ReactNode }> | undefined
    }
  | null = null
const refreshSeq = createRefreshSequencer()

// Non-RSC route HMR: @vitejs/plugin-rsc suppresses client-environment updates
// for page modules it tracks (all pages are reachable from the RSC routes
// glob), so editing a page never reaches the browser through the normal HMR
// pipeline. The plugin does broadcast 'rsc:update' for any tracked file
// change, so we listen here and refresh the page whose file changed: re-import
// with a cache-busting query (the browser module registry still holds the
// pre-edit module), then swap the component and layout through the live
// RouteProvider state. Registered at module scope so the listener exists
// before hydration; updates that arrive before RouteProvider mounts are
// queued and consumed on mount. Edits to files that are not page modules
// (layouts, shared components) match no route and are skipped — their browser
// registry entries stay stale (known limitation). RSC routes are skipped
// here; rsc-content.tsx refreshes those via the Flight stream.
if (import.meta.hot && typeof window !== 'undefined') {
  const onRscUpdate = (data: unknown) => {
    const file = (data as { file?: string } | undefined)?.file
    if (!file) return
    const route = findSerializedRouteByFile(file)
    if (!route || route.rsc || !route.id) return
    const routeId = route.id
    const seq = refreshSeq.next()
    import(/* @vite-ignore */ `${routeId}?t=${Date.now()}`)
      .then((mod) => {
        if (!refreshSeq.isCurrent(seq)) return
        const fresh = mod as {
          default?: ComponentType<Record<string, unknown>>
          layout?: unknown
        }
        const component = fresh.default
        if (!component) return
        const layout =
          typeof fresh.layout === 'function'
            ? (fresh.layout as ComponentType<{ children: ReactNode }>)
            : undefined
        if (routeRefreshHandler) {
          routeRefreshHandler(routeId, component, layout)
        } else {
          pendingRouteRefresh = { routeId, component, layout }
        }
      })
      .catch((error: unknown) => {
        if (refreshSeq.isCurrent(seq)) {
          console.error('[core] route HMR refresh error:', error)
        }
      })
  }
  import.meta.hot.on('rsc:update', onRscUpdate)
  import.meta.hot.dispose(() => {
    import.meta.hot?.off('rsc:update', onRscUpdate)
  })
}

export function useRouteContext(): RouteContextValue {
  const ctx = useContext(RouterCtx)
  if (!ctx) throw new Error('useRouteContext must be used within a RouteProvider')
  return ctx
}

export function useRouteData() {
  const { route } = useRouteContext()
  return route?.data ?? null
}

export function useRouteHead() {
  const { route } = useRouteContext()
  return route?.head ?? null
}
export function useNavigate() {
  return useRouteContext().navigate
}

export function useParams() {
  if (isServer) {
    const syncCtx = (globalThis as Record<symbol, unknown>)[RSC_SYNC_CTX]
    if (syncCtx && typeof syncCtx === 'object') {
      const rscParams = (syncCtx as Record<string, unknown>).params as
        | Record<string, string>
        | undefined
      if (rscParams) return rscParams
    }
  }
  return useRouteContext().params
}

async function waitFetch(url: string): Promise<Record<string, unknown>> {
  const cacheBuster = `_t=${Date.now()}`
  const separator = url.includes('?') ? '&' : '?'
  const response = await fetch(`${url}${separator}${cacheBuster}`)
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
  return response.json()
}

export function RouteProvider({
  routes,
  location: initialUrl,
  ctxHydration: serverHydration,
  routeMap,
  children,
}: RouteProviderProps) {
  const initialRoute = initialUrl
    ? (() => {
        const loc = parseLocation(initialUrl)
        const result = matchRoute(routes, loc.pathname)
        return {
          location: loc,
          match: result ?? { route: null, params: {} },
          route: serverHydration ?? null,
        }
      })()
    : (() => {
        const loc = parseLocation(window.location)
        const result = matchRoute(routes, loc.pathname)
        return {
          location: loc,
          match: result ?? { route: null, params: {} },
          // window.route is set by the server's inline <script> in the HTML template
          // (rendering.ts serializes route data before the module script tag).
          // The inline script runs synchronously during HTML parsing, so it's
          // guaranteed to execute before the module script. If the template order
          // changes, window.route may be undefined at this point.
          route: window.route ?? serverHydration ?? null,
        }
      })()

  const [location, setLocation] = useState<ParsedLocation>(initialRoute.location)
  const [match, setMatch] = useState<{ route: RouteDef | null; params: Record<string, string> }>({
    route: initialRoute.match.route,
    params: initialRoute.match.params,
  })
  const [routeData, setRouteData] = useState<Record<string, unknown> | null>(initialRoute.route)
  const firstRenderRef = useRef(true)
  if (routeMap) routeMapRef.current = routeMap

  // Non-RSC HMR: apply components refreshed by the module-level 'rsc:update'
  // listener (see module scope above). Mutating the live route defs (the
  // `routes` prop array — the current match object is one of them) makes
  // future SPA navigations pick up the fresh module; setMatch re-renders when
  // the refreshed page is the one currently shown. The queue covers updates
  // that arrived before this effect ran.
  useEffect(() => {
    const applyRefresh = (
      routeId: string,
      component: ComponentType<Record<string, unknown>>,
      layout: ComponentType<{ children: ReactNode }> | undefined,
    ) => {
      for (const def of routes) {
        if (def.id === routeId) {
          def.component = component
          def.layout = layout
        }
      }
      setMatch((m) =>
        m.route && m.route.id === routeId ? { ...m, route: { ...m.route, component, layout } } : m,
      )
    }
    routeRefreshHandler = applyRefresh
    if (pendingRouteRefresh) {
      const pending = pendingRouteRefresh
      pendingRouteRefresh = null
      applyRefresh(pending.routeId, pending.component, pending.layout)
    }
    return () => {
      routeRefreshHandler = null
    }
  }, [routes])

  // On navigation (non-RSC): re-fetch data via getData endpoint
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }

    const loadData = async () => {
      const route = match.route!
      console.log('[RouteProvider] loadData', location.pathname, {
        hasGetData: !!route.getData,
        routeType: route.rsc ? 'rsc' : 'csr',
      })
      const state: Record<string, unknown> = { data: {} }

      if (route.getData) {
        try {
          const result = await waitFetch(`/-/data${location.pathname}`)
          state.data = result
        } catch (err: unknown) {
          console.error('[RouteProvider] getData error:', err)
        }
      }

      setRouteData({ ...state, head: null, firstRender: false })
    }

    loadData()
  }, [location.pathname])

  // Update document title on navigation for non-RSC routes.
  // For RSC routes, RscSlot handles this via the flight payload.
  // For SSR routes during SPA navigation, load the page module's
  // getMeta to restore the document title (lost after previous
  // RSC navigation mutated it).
  useEffect(() => {
    const route = match.route
    if (!route || route.rsc) return
    if (typeof route.getMeta !== 'function') return

    route
      .getMeta({ url: new URL(window.location.href) })
      .then((head: Record<string, unknown>) => {
        if (head?.title && typeof head.title === 'string') {
          document.title = head.title
        }
      })
      .catch(() => {})
  }, [location.pathname])

  // Client-side: listen to popstate for back/forward
  useEffect(() => {
    const onPop = () => {
      const loc = parseLocation(window.location)
      const result = matchRoute(routes, loc.pathname)
      startTransition(() => {
        setLocation(loc)
        setMatch(result ?? { route: null, params: {} })
      })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [routes])

  // Client-side: delegated link interception for SPA navigation.
  // Must use useLayoutEffect so the handler is registered before the browser
  // paints — useEffect fires after paint, creating a race window where clicks
  // are not intercepted and cause full page reloads.
  useIsomorphicLayoutEffect(() => {
    const handler = (e: MouseEvent) => {
      // Let <Link> component handle its own navigation — skip if already handled
      if (e.defaultPrevented) return
      if (!(e.target instanceof HTMLElement)) return
      const link = e.target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      if (e.metaKey || e.ctrlKey || e.button === 1) return
      if (link.target === '_blank') return
      const url = new URL(link.href)
      if (url.origin !== window.location.origin) return
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (link.hasAttribute('download')) return
      e.preventDefault()
      window.history.pushState(null, '', link.href)
      const loc = parseLocation(window.location)
      startTransition(() => {
        const result = matchRoute(routes, loc.pathname)
        setLocation(loc)
        setMatch(result ?? { route: null, params: {} })
      })
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [routes])

  const navigate = useCallback(
    (to: string | number, options?: { replace?: boolean; state?: unknown }) => {
      if (isServer) return
      if (typeof to === 'number') {
        window.history.go(to)
        return
      }
      if (options?.replace) {
        window.history.replaceState(options.state ?? null, '', to)
      } else {
        window.history.pushState(options?.state ?? null, '', to)
      }
      const loc = parseLocation(window.location)
      startTransition(() => {
        const result = matchRoute(routes, loc.pathname)
        setLocation(loc)
        setMatch(result ?? { route: null, params: {} })
      })
    },
    [routes],
  )

  const ctx: RouteContextValue = {
    location,
    match: match.route,
    params: match.params,
    navigate,
    route: routeData,
  }

  return <RouterCtx.Provider value={ctx}>{children}</RouterCtx.Provider>
}

// useServerAction is available directly from './rsc-content' — not re-exported here
// to keep RSC imports from contaminating the non-RSC module graph
