// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouteProvider } from './core'

describe('RouteProvider', () => {
  it('renders children', () => {
    const routes: any[] = [{ path: '/', component: () => null }]
    render(
      <RouteProvider routes={routes} location="/">
        <div>hello</div>
      </RouteProvider>
    )
    expect(screen.getByText('hello')).toBeDefined()
  })
})
