'use client';

import { createContext, useContext, lazy, type ComponentType, type ReactNode } from 'react'
import { useSnapshot } from 'valtio'

export interface RouteDef {
  path: string
  component?: ComponentType<unknown>
  loader?: () => Promise<{ default: ComponentType<unknown> }>
  id?: string
}

export interface RouteContextValue {
  state?: Record<string, unknown>
  snapshot?: Record<string, unknown>
}

export const RouteContext = createContext<RouteContextValue>({})

export const isServer = typeof window === 'undefined' && typeof process === 'object'

export function useRouteContext(): RouteContextValue {
  const routeContext = useContext(RouteContext)
  if (routeContext.state) {
    routeContext.snapshot = isServer
      ? (routeContext.state ?? {})
      : useSnapshot(routeContext.state ?? {})
  }
  return routeContext
}

/**
 * Hydrate routes from server-injected data.
 *
 * window.routes carries route metadata serialized by the server
 * (via Routes.toJSON in server.ts). The fromInput parameter maps
 * route identifiers to their corresponding async import loaders.
 * This function attaches lazy-loaded components to each route entry.
 */
export function hydrateRoutes(
  fromInput:
    | Array<{ path: string; id?: string; [key: string]: unknown }>
    | Record<string, () => Promise<unknown>>,
): RouteDef[] {
  let loaders: Record<string, () => Promise<unknown>>
  if (Array.isArray(fromInput)) {
    loaders = Object.fromEntries(
      fromInput.map((route) => [route.path, route as unknown as () => Promise<unknown>]),
    )
  } else {
    loaders = fromInput
  }
  return (window.routes ?? []).map((entry) => {
    // Don't spread layout from serialized metadata — Routes.toJSON() turns
    // layout into a boolean (!!layout), which when spread would override the
    // real layout component with false (causing "Element type is invalid" in
    // RouteRenderer). Keep getData/getMeta/onEnter booleans for navigation.
    // Instead, capture whether the route had a layout so we can load it from
    // the page module's named export — matching what the server rendered.
    const hasLayout = !!entry.layout
    const { layout: _l, ...clean } = entry
    // RSC routes: skip lazy component creation. Server components can import
    // server-only modules (like @cyb3rcore/reactify/server with node:async_hooks)
    // that would crash if loaded in the browser. RouteRenderer handles RSC routes
    // by rendering the RscContent component which fetches the RSC flight payload.
    if (entry.rsc) {
      return clean as unknown as RouteDef
    }
    const key = String(entry.id ?? entry.path ?? '')
    const loader = memoImport<Record<string, unknown>>(
      loaders[key] as () => Promise<Record<string, unknown>>,
    )
    // Build the result with the lazy-loaded component (default export).
    // Both component and layout live in the same page module — we share
    // one loader via memoImport so there is only one network request.
    const result: Record<string, unknown> = {
      ...clean,
      loader,
      component: lazy(() => loader().then(m => ({ default: m.default as ComponentType<unknown> }))),
    }
    // For SSR routes with a layout: load the layout named export from the
    // same page module. This lets RouteRenderer hydrate with the correct
    // layout wrapper, preventing "server rendered X but client expected Y"
    // mismatches. The lazy() resolves from the same memoized loader as the
    // component — no extra fetch.
    if (hasLayout) {
      result.layout = lazy(() =>
        loader().then(m => {
          const Layout = m.layout as React.ComponentType<{ children: ReactNode }> | undefined
          if (!Layout) throw new Error('[hydrateRoutes] expected layout export in page module')
          return { default: Layout }
        }),
      )
    }
    // Convert getMeta boolean to a callable function for SSR routes.
    // The serialized metadata has getMeta: true (boolean from Routes.toJSON).
    // Client-side navigation needs the actual getMeta function to restore
    // document.title when navigating to non-RSC pages via SPA (the title
    // set by SSR is lost after an RSC navigation mutated it earlier).
    if (entry.getMeta) {
      result.getMeta = async (ctx: Record<string, unknown>) => {
        const mod = await loader()
        const metaFn = (mod as Record<string, unknown>).getMeta as
          | ((ctx: Record<string, unknown>) => Promise<Record<string, unknown>>)
          | undefined
        if (typeof metaFn === 'function') return metaFn(ctx)
        return {}
      }
    }
    return result as unknown as RouteDef
  })
}

/**
 * Memoize an async import function so it only loads once.
 * Symbols are used as property keys on the function object to cache state.
 */
function memoImport<T>(func: () => Promise<T>): () => Promise<T> {
  const kFuncExecuted = Symbol('kFuncExecuted')
  const kFuncValue = Symbol('kFuncValue')
  const cache = func as unknown as Record<symbol, boolean | T>
  cache[kFuncExecuted] = false
  return async () => {
    if (!cache[kFuncExecuted]) {
      cache[kFuncValue] = await func()
      cache[kFuncExecuted] = true
    }
    return cache[kFuncValue] as T
  }
}
