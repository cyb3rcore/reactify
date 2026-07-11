// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React, { Suspense } from 'react'

// Hoisted mock references for per-test control
const { mockCreateFromFetch, mockSetServerCallback, mockConsumePrefetch, mockFetch } = vi.hoisted(() => ({
  mockCreateFromFetch: vi.fn(),
  mockSetServerCallback: vi.fn(),
  mockConsumePrefetch: vi.fn(),
  mockFetch: vi.fn(),
}))

// Mock global fetch to prevent URL parse errors from '/_.rsc' relative URLs
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

// Mock @vitejs/plugin-rsc/browser
vi.mock('@vitejs/plugin-rsc/browser', () => ({
  createFromFetch: mockCreateFromFetch,
  setServerCallback: mockSetServerCallback,
  createTemporaryReferenceSet: vi.fn(() => ({})),
  encodeReply: vi.fn(() => ''),
}))

// Mock consumePrefetch
vi.mock('./prefetch-cache.js', () => ({
  consumePrefetch: mockConsumePrefetch,
}))

describe('RscSlot', () => {
  beforeEach(() => {
    vi.resetModules()
    // Default: createFromFetch returns a simple fallback
    mockCreateFromFetch.mockReturnValue(
      Promise.resolve({
        matches: [{ element: React.createElement('div', { 'data-testid': 'fallback' }, 'Fallback') }],
        head: { title: 'Fallback' },
      }),
    )
    // Default: no prefetch cache hit
    mockConsumePrefetch.mockReturnValue(undefined)
  })

  it('renders content from resolved initialRscPromise', async () => {
    const [{ RouteProvider }, { default: RscSlot }] = await Promise.all([
      import('./core.js'),
      import('./rsc-content.js'),
    ])
    const resolvedPromise = Promise.resolve({
      matches: [{ element: React.createElement('div', { 'data-testid': 'initial' }, 'Initial') }],
    })

    // Make consumePrefetch return a cached promise matching expected content
    // so the navigation effect preserves it
    const cachedPromise = Promise.resolve({
      matches: [{ element: React.createElement('div', { 'data-testid': 'initial' }, 'Initial') }],
    })
    mockConsumePrefetch.mockReturnValue(cachedPromise)

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '/', rsc: true }]} location="/">
          <Suspense fallback={<div>loading</div>}>
            <RscSlot initialRscPromise={resolvedPromise} />
          </Suspense>
        </RouteProvider>,
      )
    })

    expect(screen.getByTestId('initial')).toBeDefined()
    expect(screen.getByText('Initial')).toBeDefined()
  })

  it('fetches on navigation when no cache hit', async () => {
    const [{ RouteProvider, useNavigate }, { default: RscSlot }] = await Promise.all([
      import('./core.js'),
      import('./rsc-content.js'),
    ])

    const initialPromise = Promise.resolve({ matches: [{ element: React.createElement('div', null, 'Initial') }] })

    // Ensure no cache hit (default mock already returns undefined)
    mockConsumePrefetch.mockReturnValue(undefined)

    let navigate: ReturnType<typeof useNavigate>
    function NavCapture() {
      navigate = useNavigate()
      return null
    }

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '[...path]', rsc: true }]} location="/">
          <Suspense fallback={null}>
            <RscSlot initialRscPromise={initialPromise} />
            <NavCapture />
          </Suspense>
        </RouteProvider>,
      )
    })

    // Navigation effect should NOT fire on first mount when initialRscPromise is provided
    expect(mockCreateFromFetch).not.toHaveBeenCalled()

    // Navigate — triggers navigation effect
    mockConsumePrefetch.mockReturnValue(undefined)
    await act(async () => {
      navigate('/other')
    })

    expect(mockCreateFromFetch).toHaveBeenCalledTimes(1)
  })

  it('registers setServerCallback on mount', async () => {
    const [{ RouteProvider }, { default: RscSlot, setServerCallback }] = await Promise.all([
      import('./core.js'),
      import('./rsc-content.js'),
    ])
    const resolvedPromise = Promise.resolve({ matches: [] })

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '/', rsc: true }]} location="/">
          <Suspense fallback={null}>
            <RscSlot initialRscPromise={resolvedPromise} />
          </Suspense>
        </RouteProvider>,
      )
    })
    expect(setServerCallback).toHaveBeenCalled()
    expect(typeof vi.mocked(setServerCallback).mock.calls[0][0]).toBe('function')
  })

  it('updates document title from payload head', async () => {
    const [{ RouteProvider }, { default: RscSlot }] = await Promise.all([
      import('./core.js'),
      import('./rsc-content.js'),
    ])
    const resolvedPromise = Promise.resolve({
      matches: [{ element: React.createElement('div', null, 'Hello') }],
      head: { title: 'Page Title' },
    })

    // Make consumePrefetch return a cached promise with matching head
    const cachedPromise = Promise.resolve({
      matches: [{ element: React.createElement('div', null, 'Hello') }],
      head: { title: 'Page Title' },
    })
    mockConsumePrefetch.mockReturnValue(cachedPromise)

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '/', rsc: true }]} location="/">
          <Suspense fallback={null}>
            <RscSlot initialRscPromise={resolvedPromise} />
          </Suspense>
        </RouteProvider>,
      )
    })
    // Effects run after the act scope — title update is committed
    expect(document.title).toBe('Page Title')
  })
})
