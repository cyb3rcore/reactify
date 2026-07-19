// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

beforeEach(() => {
  cleanup()
})
import React from 'react'
import create from './create.js'
import { type RouteDef } from '../core-shared.js'

const testRoutes: RouteDef[] = [
  { path: '/', component: () => React.createElement('div', { 'data-testid': 'home' }, 'Home') },
  { path: '/about', component: () => React.createElement('div', null, 'About') },
]

describe('create', () => {
  it('renders RouteProvider with RouteRenderer', () => {
    const app = create({
      url: '/',
      routes: testRoutes,
    })
    render(<>{app}</>)
    expect(screen.getByTestId('home')).toBeDefined()
    expect(screen.getByText('Home')).toBeDefined()
  })

  it('renders with routeMap', () => {
    const routeMap = { '/': { path: '/' }, '/about': { path: '/about' } }
    const app = create({
      url: '/about',
      routes: testRoutes,
      routeMap,
    })
    render(<>{app}</>)
    expect(screen.getByText('About')).toBeDefined()
  })

  it('renders with ctxHydration', () => {
    const app = create({
      url: '/',
      routes: testRoutes,
      ctxHydration: { data: { key: 'value' } },
    })
    render(<>{app}</>)
    expect(screen.getByTestId('home')).toBeDefined()
  })
})
