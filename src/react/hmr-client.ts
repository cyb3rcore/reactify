import { matchRoute } from './router.js'
import type { RouteDef } from './core-shared.js'

// window.routes entries are serialized as { id, path, rsc, ... } where id is
// the root-relative page module path (matches the keys of $app/routes.js's
// import.meta.glob). Only call these from browser contexts (typeof window).

export function matchSerializedRoute(
  pathname: string,
): { route: RouteDef; params: Record<string, string> } | null {
  const routes = window.routes
  if (!routes?.length) return null
  return matchRoute(routes as unknown as RouteDef[], pathname)
}

export function findSerializedRouteByFile(file: string): RouteDef | null {
  const routes = window.routes
  if (!routes?.length) return null
  const entry = (routes as unknown as RouteDef[]).find((r) => r.id && file.endsWith(r.id))
  return entry ?? null
}

export interface RefreshSequencer {
  next(): number
  isCurrent(seq: number): boolean
}

export function createRefreshSequencer(): RefreshSequencer {
  let current = 0
  return {
    next: () => ++current,
    isCurrent: (seq: number) => seq === current,
  }
}
