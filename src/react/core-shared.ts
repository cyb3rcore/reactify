import { useRouteContext } from './virtual/core.js'
import type { ParsedLocation } from './router.js'
import type React from 'react'

export interface RouteDef {
  path: string
  id?: string
  component?: React.ComponentType<Record<string, unknown>>
  layout?: React.ComponentType<{ children: React.ReactNode }>
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

export interface RouteProviderProps {
  routes: RouteDef[]
  location?: string
  ctxHydration?: Record<string, unknown>
  routeMap?: Record<string, unknown>
  children: React.ReactNode
}

const RSC_SYNC_CTX = Symbol.for('reactify.rscContext')
const isServer = typeof window === 'undefined'
const routeMapRef: { current: Record<string, unknown> } = { current: {} }

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

export { isServer, RSC_SYNC_CTX, routeMapRef }
