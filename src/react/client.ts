// @ts-nocheck
import { createContext, useContext, lazy, type ComponentType } from 'react'
import { useSnapshot } from 'valtio'

export interface RouteDef {
  path: string
  component?: ComponentType<unknown>
  loader?: () => Promise<{ default: ComponentType<unknown> }>
  id?: string
  [key: string]: unknown
}

export interface RouteContextValue {
  state?: Record<string, unknown>
  snapshot?: Record<string, unknown>
  [key: string]: unknown
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

declare global {
  interface Window {
    routes?: RouteDef[]
  }
}

export async function hydrateRoutes(
  fromInput: RouteDef[] | Record<string, RouteDef>,
): Promise<RouteDef[]> {
  let from: Record<string, RouteDef>
  if (Array.isArray(fromInput)) {
    from = Object.fromEntries(
      fromInput.map((route) => [route.path as string, route]),
    )
  } else {
    from = fromInput
  }
  const windowRoutes = (window as { routes?: unknown[] }).routes ?? []
  return windowRoutes.map((route) => {
    const r = route as Record<string, unknown>
    r.loader = memoImport(from[r.id as string])
    r.component = lazy(() => (r.loader as () => Promise<unknown>)())
    return r as unknown as RouteDef
  })
}

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
