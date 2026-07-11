import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  startTransition,
  type ReactNode,
} from 'react'
import { matchRoute, parseLocation, type ParsedLocation } from '../router.js'

const isServer = typeof window === 'undefined'
const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect
const routeMapRef: { current: Record<string, unknown> } = { current: {} }

export interface RouteDef {
  path: string
  id?: string
  component?: React.ComponentType<Record<string, unknown>>
  layout?: React.ComponentType<{ children: ReactNode }>
  getData?: (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>
  getMeta?: (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>
  onEnter?: (ctx: Record<string, unknown>) => Promise<unknown>
  rsc?: boolean
}

export interface RouteContextValue {
  location: ParsedLocation
  match: RouteDef | null
  params: Record<string, string>
  navigate: (to: string | number, options?: { replace?: boolean; state?: unknown }) => void
  route: Record<string, unknown> | null
}

const RouterCtx = createContext<RouteContextValue | null>(null)

export function useRouteContext(): RouteContextValue {
  const ctx = useContext(RouterCtx)
  if (!ctx) throw new Error('useRouteContext must be used within a RouteProvider')
  return ctx
}

export function useNavigate() {
  return useRouteContext().navigate
}

export function useParams() {
  return useRouteContext().params
}

export function useRouteData() {
  const { route } = useRouteContext()
  return route?.data ?? null
}

export function useRouteHead() {
  const { route } = useRouteContext()
  return route?.head ?? null
}

async function waitFetch(url: string): Promise<Record<string, unknown>> {
  const cacheBuster = `_t=${Date.now()}`
  const separator = url.includes('?') ? '&' : '?'
  const response = await fetch(`${url}${separator}${cacheBuster}`)
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
  return response.json()
}

export interface RouteProviderProps {
  routes: RouteDef[]
  location?: string
  ctxHydration?: Record<string, unknown>
  routeMap?: Record<string, unknown>
  children: ReactNode
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

  // On navigation (non-RSC): re-fetch data via getData endpoint
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }

    const loadData = async () => {
      const route = match.route!
      console.log('[RouteProvider] loadData', location.pathname, { hasGetData: !!route.getData, routeType: route.rsc ? 'rsc' : 'csr' })
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
