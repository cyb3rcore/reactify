// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { RouteProvider } from './core.js'
import Link from './link.js'
import { prefetchRsc } from './prefetch-cache.js'

vi.mock('./prefetch-cache.js', () => ({
  prefetchRsc: vi.fn(),
}))

const testRoutes = [
  { path: '/', component: () => React.createElement('div', null, 'Home') },
  { path: '/about', component: () => React.createElement('div', null, 'About') },
]

describe('Link', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an anchor with href', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about">About</Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/about')
  })

  it('calls navigate on click', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about">About</Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    link.click()
    // After click, location should be /about
    expect(window.location.pathname).toBe('/about')
  })

  it('prefetches on hover by default', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about">About</Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    fireEvent.mouseEnter(link)
    expect(prefetchRsc).toHaveBeenCalledWith('/about')
  })

  it('does not prefetch when prefetch=false', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about" prefetch={false}>
          About
        </Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    fireEvent.mouseEnter(link)
    expect(prefetchRsc).not.toHaveBeenCalled()
  })

  it('forwards unknown props to the rendered anchor', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link
          to="/about"
          className="btn"
          data-e2e="link-props"
          aria-label="About page"
          id="about-link"
          target="_blank"
          rel="noopener"
          style={{ color: 'red' }}
        >
          About
        </Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    expect(link.getAttribute('class')).toBe('btn')
    expect(link.getAttribute('data-e2e')).toBe('link-props')
    expect(link.getAttribute('aria-label')).toBe('About page')
    expect(link.getAttribute('id')).toBe('about-link')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener')
    expect((link as HTMLElement).style.color).toBe('red')
  })

  it('keeps href derived from to when rest props are present', () => {
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about" className="btn">
          About
        </Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    expect(link.getAttribute('href')).toBe('/about')
  })

  it('internal click handler wins over a caller-supplied onClick', () => {
    const callerOnClick = vi.fn()
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about" onClick={callerOnClick}>
          About
        </Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    link.click()
    expect(callerOnClick).not.toHaveBeenCalled()
    // Internal handler still navigates.
    expect(window.location.pathname).toBe('/about')
  })

  it('internal prefetch handler wins over a caller-supplied onMouseEnter', () => {
    const callerOnMouseEnter = vi.fn()
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about" onMouseEnter={callerOnMouseEnter}>
          About
        </Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    fireEvent.mouseEnter(link)
    expect(callerOnMouseEnter).not.toHaveBeenCalled()
    expect(prefetchRsc).toHaveBeenCalledWith('/about')
  })

  it('passes through meta+click without calling navigate', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    render(
      <RouteProvider routes={testRoutes} location="/">
        <Link to="/about">About</Link>
      </RouteProvider>,
    )
    const link = screen.getByText('About')
    // Simulate meta+click — should NOT call pushState (browser handles it)
    link.dispatchEvent(new MouseEvent('click', { metaKey: true, bubbles: true }))
    expect(pushStateSpy).not.toHaveBeenCalled()
  })
})
