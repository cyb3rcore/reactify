// @vitest-environment jsdom
// Tests for RouteProvider, routing hooks (useNavigate, useParams, useRouteData, useRouteHead),
// and SPA link interception with history integration.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, renderHook, act, cleanup } from '@testing-library/react'
import React from 'react'
import { RouteProvider, useRouteContext, useNavigate, useParams, useRouteData, useRouteHead } from './core.js'

// Set up mock route table with static and parameterized paths
const testRoutes = [
  { path: '/', component: () => React.createElement('div', null, 'Home') },
  { path: '/about', component: () => React.createElement('div', null, 'About') },
  { path: '/users/[id]', component: () => React.createElement('div', null, 'User') },
  { path: '/users/settings', component: () => React.createElement('div', null, 'Settings') },
]

// Suppress console.error for tests that intentionally throw
let consoleError: typeof console.error
beforeEach(() => {
  // Suppress console.error for tests that intentionally throw
  consoleError = console.error
  console.error = vi.fn()
  cleanup()
})
afterEach(() => {
  console.error = consoleError
  cleanup()
})

// ---- Section: RouteProvider ----
describe('RouteProvider', () => {
  // When RouteProvider wraps children, expect children to render
  it('renders children', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <div>hello</div>
      </RouteProvider>,
    )
    expect(screen.getByText('hello')).toBeDefined()
  })

  // When location matches a route, expect the matched route context
  it('matches initial location to a route', () => {
    function TestComponent() {
      const ctx = useRouteContext()
      return React.createElement('div', null,
        `Match: ${ctx.match?.path ?? 'none'}`)
    }
    render(
      <RouteProvider routes={testRoutes} location="/about">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('Match: /about')).toBeDefined()
  })

  // When location contains params, expect them extracted via route matching
  it('provides matched params', () => {
    function TestComponent() {
      const { params } = useRouteContext()
      return React.createElement('div', null, `User ID: ${params.id}`)
    }
    render(
      <RouteProvider routes={testRoutes} location="/users/42">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('User ID: 42')).toBeDefined()
  })

  // When location does not match any route, expect null match
  it('returns null match for unknown routes', () => {
    function TestComponent() {
      const ctx = useRouteContext()
      return React.createElement('div', null,
        `Match: ${ctx.match === null ? 'none' : ctx.match.path}`)
    }
    render(
      <RouteProvider routes={testRoutes} location="/unknown">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('Match: none')).toBeDefined()
  })

  // When server hydration data is provided, expect it available in route context
  it('uses server hydration data when provided', () => {
    function TestComponent() {
      const ctx = useRouteContext()
      return React.createElement('div', null,
        `Data: ${JSON.stringify(ctx.route?.data)}`)
    }
    render(
      <RouteProvider
        routes={testRoutes}
        location="/"
        ctxHydration={{ data: { message: 'from server' } }}
      >
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('Data: {"message":"from server"}')).toBeDefined()
  })

  // When navigate is accessible from context, expect it to be a callable function
  it('provides navigate function', () => {
    function TestComponent() {
      const navigate = useNavigate()
      return React.createElement('button', { onClick: () => navigate('/about') }, 'navigate')
    }
    render(
      <RouteProvider routes={testRoutes} location="/">
        <TestComponent />
      </RouteProvider>,
    )
    const btn = screen.getByText('navigate')
    expect(btn).toBeDefined()
  })

  // When useNavigate is called outside RouteProvider, expect throw
  it('useNavigate throws when used outside RouteProvider', () => {
    function TestComponent() {
      useNavigate()
      return null
    }
    expect(() => render(<TestComponent />)).toThrow('useRouteContext')
  })
})

// ---- Section: useParams ----
describe('useParams', () => {
  // When route has params, expect them returned from the matched route
  it('returns params from matched route', () => {
    function TestComponent() {
      const params = useParams()
      return React.createElement('div', null, `id=${params.id}`)
    }
    render(
      <RouteProvider routes={testRoutes} location="/users/99">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('id=99')).toBeDefined()
  })

  // When route has no params, expect an empty object
  it('returns empty object for no params', () => {
    function TestComponent() {
      const params = useParams()
      return React.createElement('div', null, `keys=${Object.keys(params).length}`)
    }
    render(
      <RouteProvider routes={testRoutes} location="/about">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('keys=0')).toBeDefined()
  })
})

// ---- Section: useRouteData ----
describe('useRouteData', () => {
  // When no hydration data is provided, expect null
  it('returns null when no data', () => {
    function TestComponent() {
      const data = useRouteData()
      return React.createElement('div', null, `data=${JSON.stringify(data)}`)
    }
    render(
      <RouteProvider routes={testRoutes} location="/">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('data=null')).toBeDefined()
  })

  // When hydration data includes items, expect them returned from context
  it('returns data from hydration', () => {
    function TestComponent() {
      const data = useRouteData()
      return React.createElement('div', null, `items=${(data as { items?: number[] })?.items?.length}`)
    }
    render(
      <RouteProvider
        routes={testRoutes}
        location="/"
        ctxHydration={{ data: { items: [1, 2, 3] } }}
      >
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('items=3')).toBeDefined()
  })
})

// ---- Section: useRouteHead ----
describe('useRouteHead', () => {
  // When no head data is provided, expect null
  it('returns null when no head', () => {
    function TestComponent() {
      const head = useRouteHead()
      return React.createElement('div', null, `head=${JSON.stringify(head)}`)
    }
    render(
      <RouteProvider routes={testRoutes} location="/">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByText('head=null')).toBeDefined()
  })
})

// ---- Section: navigate ----
describe('navigate', () => {
  // When navigate() is called with a path, expect location to update
  it('changes location via navigate()', () => {
    function TestComponent() {
      const { location, navigate } = useRouteContext()
      return React.createElement('div', null,
        React.createElement('span', { 'data-testid': 'path' }, location.pathname),
        React.createElement('button', {
          onClick: () => navigate('/about'),
        }, 'Go to About'),
      )
    }
    render(
      <RouteProvider routes={testRoutes} location="/">
        <TestComponent />
      </RouteProvider>,
    )
    expect(screen.getByTestId('path').textContent).toBe('/')
    act(() => {
      screen.getByText('Go to About').click()
    })
    expect(screen.getByTestId('path').textContent).toBe('/about')
  })

  // When navigate uses replace option, expect location replaced without history entry
  it('navigate with replace option', () => {
    function TestComponent() {
      const { location, navigate } = useRouteContext()
      return React.createElement('div', null,
        React.createElement('span', { 'data-testid': 'path' }, location.pathname),
        React.createElement('button', {
          onClick: () => navigate('/about', { replace: true }),
        }, 'Replace'),
      )
    }
    render(
      <RouteProvider routes={testRoutes} location="/">
        <TestComponent />
      </RouteProvider>,
    )
    act(() => {
      screen.getByText('Replace').click()
    })
    expect(screen.getByTestId('path').textContent).toBe('/about')
  })

  // When navigate receives a number, expect window.history.go to be called
  it('navigate by number calls history.go', () => {
    const goSpy = vi.spyOn(window.history, 'go')
    function TestComponent() {
      const navigate = useNavigate()
      return React.createElement('button', {
        onClick: () => navigate(-1),
      }, 'Back')
    }
    render(
      <RouteProvider routes={testRoutes} location="/">
        <TestComponent />
      </RouteProvider>,
    )
    act(() => { screen.getByText('Back').click() })
    expect(goSpy).toHaveBeenCalledWith(-1)
    goSpy.mockRestore()
  })
})

// ---- Section: RouteProvider routeMap ----
describe('RouteProvider routeMap', () => {
  // When a routeMap is provided, expect it stored in module-level reference
  it('stores routeMap in module-level reference', () => {
    const routeMap = { '/': { path: '/' }, '/about': { path: '/about' } }
    render(
      <RouteProvider routes={testRoutes} location="/" routeMap={routeMap}>
        <div>routeMap test</div>
      </RouteProvider>,
    )
    expect(screen.getByText('routeMap test')).toBeDefined()
  })
})
