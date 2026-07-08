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

// RSC plugin runtime extensions on import.meta
interface ImportMeta {
  readonly viteRsc: {
    import: <T>(
      specifier: string,
      options: { environment: string },
    ) => Promise<T>
    loadModule: <T>(environmentName: string, entryName?: string) => Promise<T>
    loadBootstrapScriptContent: (entryName: string) => Promise<string>
  }
  readonly hot?: {
    accept(): void
    accept(path: string): void
    accept(path: string, cb: (mod: unknown) => void): void
    dispose(cb: (data: unknown) => void): void
    invalidate(): void
  }
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


