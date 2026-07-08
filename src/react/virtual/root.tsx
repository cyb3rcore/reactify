import { type ReactNode } from 'react'
import { useRouteContext } from './core'

interface RouteRendererProps {
  notFound?: React.ComponentType
}

export function RouteRenderer({ notFound: NotFound }: RouteRendererProps) {
  const { match, params, route: routeData } = useRouteContext()

  if (!match) {
    if (NotFound) return <NotFound />
    return null
  }

  const Component = match.component
  const Layout = match.layout ?? DefaultLayout

  if (!Component) return null

  return (
    <AppRoute route={routeData} params={params}>
      <Layout params={params}>
        <Component params={params} data={routeData?.data ?? {}} />
      </Layout>
    </AppRoute>
  )
}

function DefaultLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}

interface AppRouteProps {
  route: Record<string, any> | null
  params: Record<string, string>
  children: ReactNode
}

export function AppRoute({ route, params, children }: AppRouteProps) {
  return <>{children}</>
}
