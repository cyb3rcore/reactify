// Vite environment types
interface ImportMeta {
  env: {
    SSR: boolean
    [key: string]: unknown
  }
  glob(pattern: string): Record<string, () => Promise<unknown>>
  globEager(pattern: string): Record<string, unknown>
}

// Window extensions for React hydration
interface Window {
  route: Record<string, unknown>
  routes: Array<Record<string, unknown>>
}

// @unhead/react with query parameter
declare module '@unhead/react/server?server' {
  import type { ComponentType, ReactNode } from 'react'
  export const UnheadProvider: ComponentType<{ value: unknown; children?: ReactNode }>
}

// RouteContext has a static extend() method added after class definition
declare module './react/context.js' {
  const RouteContext: {
    new (...args: any[]): any
    create(server: any, req: any, reply: any, route: any, contextInit?: any): Promise<any>
    extend(initial: Record<string, any>): void
    prototype: any
  }
  export default RouteContext
}

// Module augmentation for React Router Route component paths
declare module 'react-router' {
  interface RouteMeta {
    path?: string
  }
}

// Re-declare react-router to fix TypeScript resolution issues
declare module 'react-router' {
  import type { ComponentType, ReactNode } from 'react'
  export const BrowserRouter: ComponentType<{
    basename?: string
    children?: ReactNode
    window?: Window
  }>
  export const StaticRouter: ComponentType<{
    basename?: string
    children?: ReactNode
    location?: string
  }>
  export function useLocation(): { pathname: string; search: string; hash: string; state: unknown; key: string }
  export function useNavigate(): (to: string) => void
  export const Route: ComponentType<{ path?: string; element?: ReactNode }>
  export const Routes: ComponentType<{ children?: ReactNode }>
  export { Suspense } from 'react'
}
