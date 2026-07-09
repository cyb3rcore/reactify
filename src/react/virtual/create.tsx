import { RouteProvider, type RouteDef } from './core.js'
import { RouteRenderer } from './root.js'

// NOTE: This file assembles RouteProvider + RouteRenderer as a reusable create()
// function used by rendering.ts during SSR. The same assembly also appears inline
// in rendering.ts for the dev/prod handler. This duplication is intentional —
// create.tsx is the app-level composition entry point consumed by virtual module
// imports ($app/create.js), while rendering.ts uses it for the actual SSR pipeline.

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
