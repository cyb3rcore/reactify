import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { matchRoute, parseLocation, type ParsedLocation } from '../router'

const isServer = typeof window === 'undefined'
const routeMapRef: { current: Record<string, any> } = { current: {} }

export interface RouteDef {
  path: string
  id?: string
  component?: React.ComponentType<any>
  layout?: React.ComponentType<{ children: ReactNode }>
  getData?: (ctx: any) => Promise<Record<string, any>>
  getMeta?: (ctx: any) => Promise<any>
  onEnter?: (ctx: any) => Promise<any>
  rsc?: boolean
}

export interface RouteContextValue {
  location: ParsedLocation
  match: RouteDef | null
  params: Record<string, string>
  navigate: (to: string | number, options?: { replace?: boolean; state?: any }) => void
  route: Record<string, any> | null
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

async function waitFetch(url: string): Promise<any> {
  const cacheBuster = `_t=${Date.now()}`
  const separator = url.includes('?') ? '&' : '?'
  const response = await fetch(`${url}${separator}${cacheBuster}`)
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
  return response.json()
}

export interface RouteProviderProps {
  routes: RouteDef[]
  location?: string
  ctxHydration?: Record<string, any>
  routeMap?: Record<string, any>
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
          route: (window as any).route ?? serverHydration ?? null,
        }
      })()

  const [location, setLocation] = useState<ParsedLocation>(initialRoute.location)
  const [match, setMatch] = useState<{ route: RouteDef | null; params: Record<string, string> }>({
    route: initialRoute.match.route,
    params: initialRoute.match.params,
  })
  const [routeData, setRouteData] = useState<Record<string, any> | null>(initialRoute.route)
  const firstRenderRef = useRef(true)
  if (routeMap) routeMapRef.current = routeMap

  // On navigation (non-RSC): re-fetch data via getData endpoint
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    if (!match.route || match.route.rsc) return

    const loadData = async () => {
      const route = match.route!
      const state: Record<string, any> = { data: {} }

      if (route.getData) {
        try {
          const result = await waitFetch(`/-/data${location.pathname}`)
          state.data = result
        } catch (err) {
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
      setLocation(loc)
      const result = matchRoute(routes, loc.pathname)
      setMatch(result ?? { route: null, params: {} })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [routes])

  // Client-side: delegated link interception for SPA navigation
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href]')
      if (!link || !link.href) return
      if (e.metaKey || e.ctrlKey || e.button === 1) return
      if ((link as HTMLAnchorElement).target === '_blank') return
      const url = new URL(link.href)
      if (url.origin !== window.location.origin) return
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (link.hasAttribute('download')) return
      e.preventDefault()
      window.history.pushState(null, '', link.href)
      const loc = parseLocation(window.location)
      setLocation(loc)
      const result = matchRoute(routes, loc.pathname)
      setMatch(result ?? { route: null, params: {} })
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [routes])

  const navigate = useCallback(
    (to: string | number, options?: { replace?: boolean; state?: any }) => {
      if (typeof to === 'number') {
        window.history.go(to)
        return
      }
      if (options?.replace) {
        window.history.replaceState(options.state ?? null, '', to)
      } else {
        window.history.pushState(options.state ?? null, '', to)
      }
      const loc = parseLocation(window.location)
      setLocation(loc)
      const result = matchRoute(routes, loc.pathname)
      setMatch(result ?? { route: null, params: {} })
    },
    [routes]
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

export { useServerAction } from './rsc-content'
