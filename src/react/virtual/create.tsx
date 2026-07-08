import { RouteProvider } from './core'
import { RouteRenderer } from './root'

export default function create({ url, routes, routeMap, ctxHydration }: Record<string, any>) {
  return (
    <RouteProvider routes={routes} location={url} ctxHydration={ctxHydration} routeMap={routeMap}>
      <RouteRenderer />
    </RouteProvider>
  )
}
