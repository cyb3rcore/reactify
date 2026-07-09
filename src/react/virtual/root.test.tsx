// @vitest-environment jsdom
// Tests for RouteRenderer / AppRoute component rendering: matched routes, unmatched routes,
// NotFound fallback, params, layout wrappers, and data from hydration context.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { RouteRenderer } from './root.js'
import { RouteProvider, type RouteDef } from './core.js'

// Set up mock route table with static paths for rendering tests
const testRoutes: RouteDef[] = [
  { path: '/', component: () => React.createElement('div', { 'data-testid': 'home' }, 'Home Page') },
  { path: '/about', component: () => React.createElement('div', null, 'About Page') },
]

// ---- Section: RouteRenderer ----
describe('RouteRenderer', () => {
  // When location matches a route, expect the route component to render
  it('renders the matched route component', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <RouteRenderer />
      </RouteProvider>,
    )
    expect(screen.getByTestId('home')).toBeDefined()
    expect(screen.getByText('Home Page')).toBeDefined()
  })

  // When location changes to a different route, expect the new component rendered
  it('renders different component for different route', () => {
    render(
      <RouteProvider routes={testRoutes} location="/about">
        <RouteRenderer />
      </RouteProvider>,
    )
    expect(screen.getByText('About Page')).toBeDefined()
  })

  // When location does not match any route, expect nothing rendered (null)
  it('returns null for unmatched route', () => {
    const { container } = render(
      <RouteProvider routes={testRoutes} location="/unknown">
        <RouteRenderer />
      </RouteProvider>,
    )
    // Should render nothing (null)
    expect(container.textContent).toBe('')
  })

  // When a NotFound component is provided for unmatchable routes, expect it rendered
  it('renders NotFound component when provided', () => {
    function NotFound() {
      return React.createElement('div', { 'data-testid': 'not-found' }, '404 Not Found')
    }
    render(
      <RouteProvider routes={testRoutes} location="/nonexistent">
        <RouteRenderer notFound={NotFound} />
      </RouteProvider>,
    )
    expect(screen.getByTestId('not-found')).toBeDefined()
    expect(screen.getByText('404 Not Found')).toBeDefined()
  })

  // When route has a param pattern, expect component receives params prop
  it('renders component with params prop', () => {
    const routeWithParam: RouteDef[] = [
      { path: '/users/[id]', component: (props: Record<string, unknown>) =>
        React.createElement('div', { 'data-testid': 'user' }, `User: ${(props as { params?: Record<string, string> }).params?.id}`),
      },
    ]
    render(
      <RouteProvider routes={routeWithParam} location="/users/42">
        <RouteRenderer />
      </RouteProvider>,
    )
    expect(screen.getByTestId('user')).toBeDefined()
    expect(screen.getByText('User: 42')).toBeDefined()
  })

  // When route has a layout wrapper, expect layout rendered around the route component
  it('renders component with layout wrapper', () => {
    function AuthLayout({ children }: { children: React.ReactNode }) {
      return React.createElement('div', { 'data-testid': 'layout' },
        React.createElement('header', null, 'Auth Layout'),
        children,
      )
    }
    const routesWithLayout: RouteDef[] = [
      { path: '/admin', component: () => React.createElement('div', null, 'Admin'), layout: AuthLayout },
    ]
    render(
      <RouteProvider routes={routesWithLayout} location="/admin">
        <RouteRenderer />
      </RouteProvider>,
    )
    expect(screen.getByTestId('layout')).toBeDefined()
    expect(screen.getByText('Auth Layout')).toBeDefined()
    expect(screen.getByText('Admin')).toBeDefined()
  })

  // When route has hydrated data, expect component receives data prop
  it('renders component with data from route', () => {
    const routesWithData = [
      {
        path: '/',
        component: (props: Record<string, unknown>) =>
          React.createElement('div', null,
            `Data: ${JSON.stringify((props as { data?: Record<string, unknown> }).data)}`),
      },
    ]
    render(
      <RouteProvider routes={routesWithData as RouteDef[]} location="/"
        ctxHydration={{ data: { message: 'from ctx' } }}>
        <RouteRenderer />
      </RouteProvider>,
    )
    expect(screen.getByText('Data: {"message":"from ctx"}')).toBeDefined()
  })
})
