import { createContext, useContext, lazy, type ComponentType } from 'react'
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

export const isServer =
  typeof window === 'undefined' && typeof process === 'object'

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
export async function hydrateRoutes(
  fromInput:
    | Array<{ path: string; id?: string; [key: string]: unknown }>
    | Record<string, () => Promise<unknown>>,
): Promise<RouteDef[]> {
  let loaders: Record<string, () => Promise<unknown>>
  if (Array.isArray(fromInput)) {
    loaders = Object.fromEntries(
      fromInput.map((route) => [route.path, route as unknown as () => Promise<unknown>]),
    )
  } else {
    loaders = fromInput
  }
  return (window.routes ?? []).map((entry) => {
    const key = String(entry.id ?? entry.path ?? '')
    const loader = memoImport<{ default: ComponentType<unknown> }>(
      loaders[key] as () => Promise<{ default: ComponentType<unknown> }>,
    )
    // Don't spread layout from serialized metadata — Routes.toJSON() turns
    // layout into a boolean (!!layout), which when spread would override the
    // real layout component with false (causing "Element type is invalid" in
    // RouteRenderer). Keep getData/getMeta/onEnter booleans for navigation.
    const { layout: _l, ...clean } = entry
    return {
      ...clean,
      loader,
      component: lazy(() => loader()),
    } as unknown as RouteDef
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
