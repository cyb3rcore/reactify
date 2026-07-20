'use client';
import { type ReactNode } from 'react'
import { useRouteContext } from './core.js'
import RscSlot from './rsc-content.js'
import type { RscPayload } from './rsc-content.js'

interface RouteRendererProps {
  notFound?: React.ComponentType
  initialPayload?: RscPayload | null
}

export function RouteRenderer({ notFound: NotFound, initialPayload }: RouteRendererProps) {
  const { match, params, route: routeData } = useRouteContext()

  if (!match) {
    if (NotFound) return <NotFound />
    return null
  }

  // RSC routes: render via RscSlot which receives the SSR-resolved payload
  // (initialPayload) for hydration, then fetches fresh RSC payloads on SPA
  // navigation via the _.rsc endpoint. Server component code (with server-only
  // imports) is never loaded in the browser — the flight data delivers the
  // rendered element tree.
  if (match.rsc) {
    return <RscSlot initialPayload={initialPayload} />
  }

  const Component = match.component
  // layout may be false (boolean from serialized window.routes metadata),
  // undefined (route has no layout export), or a lazy() component (object).
  // Handle all three with DefaultLayout fallback.
  const Layout = match.layout ?? DefaultLayout

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
