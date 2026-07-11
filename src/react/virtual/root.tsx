import { lazy, Suspense, type ReactNode } from 'react'
import { useRouteContext } from './core.js'

// Lazy import RscContent so server components that import server-only modules
// (e.g. @cyb3rcore/reactify/server with node:async_hooks) are never loaded in
// the browser. RscContent fetches the RSC flight payload from the server,
// avoiding client-side evaluation of server component code.
const RscContent = lazy(() => import('./rsc-content.js'))

interface RouteRendererProps {
  notFound?: React.ComponentType
}

export function RouteRenderer({ notFound: NotFound }: RouteRendererProps) {
  const { match, params, route: routeData } = useRouteContext()

  if (!match) {
    if (NotFound) return <NotFound />
    return null
  }

  // RSC routes: render via RscContent which fetches the RSC payload from the
  // server. Server component code (with server-only imports) is never loaded
  // in the browser — the flight data delivers the rendered element tree.
  // On the server, RSC routes are handled by rsc-entry/ssr-entry, so this
  // code path only runs during client-side SPA navigation.
  if (match.rsc) {
    return (
      <Suspense fallback={<div className="rsc-loading">Loading...</div>}>
        <RscContent />
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
