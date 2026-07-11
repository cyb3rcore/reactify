import { lazy, Suspense, type ReactNode } from 'react'
import { useRouteContext } from './core.js'
import type { RscPayload } from './rsc-content.js'

// Lazy import RscSlot so server components that import server-only modules
// (e.g. @cyb3rcore/reactify/server with node:async_hooks) are never loaded in
// the browser. RscSlot fetches the RSC flight payload from the server,
// avoiding client-side evaluation of server component code.
const RscSlot = lazy(() => import('./rsc-content.js'))

interface RouteRendererProps {
  notFound?: React.ComponentType
  initialRscPromise?: Promise<RscPayload>
}

export function RouteRenderer({ notFound: NotFound, initialRscPromise }: RouteRendererProps) {
  const { match, params, route: routeData } = useRouteContext()

  if (!match) {
    if (NotFound) return <NotFound />
    return null
  }

  // RSC routes: render via RscSlot which uses the initialRscPromise from SSR
  // (from createFromReadableStream) for hydration, then fetches fresh RSC
  // payloads on SPA navigation via the _.rsc endpoint. Server component code
  // (with server-only imports) is never loaded in the browser — the flight
  // data delivers the rendered element tree.
  if (match.rsc) {
    return (
      <Suspense fallback={null}>
        <RscSlot initialRscPromise={initialRscPromise} />
      </Suspense>
    )
  }

  const Component = match.component
  // layout may be false (boolean from serialized window.routes metadata)
  // or undefined (route has no layout export). Handle both with DefaultLayout.
  const Layout = typeof match.layout === 'function' ? match.layout : DefaultLayout

  if (!Component) return null

  return (
    <AppRoute route={routeData} params={params}>
      <Layout>
        <Component params={params} data={routeData?.data ?? {}} />
      </Layout>
    </AppRoute>
  )
}

function DefaultLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}

interface AppRouteProps {
  route: Record<string, unknown> | null
  params: Record<string, string>
  children: ReactNode
}

export function AppRoute({ route, params, children }: AppRouteProps) {
  return <>{children}</>
}
