import { RouteProvider, type RouteDef } from './core.js'
import { RouteRenderer } from './root.js'

interface CreateAppOptions {
  url: string
  routes: RouteDef[]
  routeMap?: Record<string, unknown>
  ctxHydration?: Record<string, unknown>
}

export default function create({ url, routes, routeMap, ctxHydration }: CreateAppOptions) {
  return (
    <RouteProvider routes={routes} location={url} ctxHydration={ctxHydration} routeMap={routeMap}>
      <RouteRenderer />
    </RouteProvider>
  )
}
