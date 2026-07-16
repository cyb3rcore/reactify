// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

// Hoisted mock references for per-test control
const { mockCreateFromFetch, mockSetServerCallback, mockConsumePrefetch, mockFetch } = vi.hoisted(
  () => ({
    mockCreateFromFetch: vi.fn(),
    mockSetServerCallback: vi.fn(),
    mockConsumePrefetch: vi.fn(),
    mockFetch: vi.fn(),
  }),
)

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
        matches: [
          { element: React.createElement('div', { 'data-testid': 'fallback' }, 'Fallback') },
        ],
        head: { title: 'Fallback' },
      }),
    )
    // Default: no prefetch cache hit
    mockConsumePrefetch.mockReturnValue(undefined)
  })

  it('renders content from resolved initialPayload', async () => {
    const [{ RouteProvider }, { default: RscSlot }] = await Promise.all([
      import('./core.js'),
      import('./rsc-content.js'),
    ])
    const initialPayload = {
      matches: [{ element: React.createElement('div', { 'data-testid': 'initial' }, 'Initial') }],
    }

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '/', rsc: true }]} location="/">
          <RscSlot initialPayload={initialPayload} />
        </RouteProvider>,
      )
    })

    expect(screen.getByTestId('initial')).toBeDefined()
    expect(screen.getByText('Initial')).toBeDefined()
  })

  it('fetches on navigation when no cache hit', async () => {
    const [{ RouteProvider, useNavigate }, { default: RscSlot }] = (await Promise.all([
      import('./core.js'),
      import('./rsc-content.js'),
    ])) as [
      typeof import('./core.js'),
      { default: React.ComponentType<{ initialPayload?: unknown }> },
    ]

    // Ensure no cache hit (default mock already returns undefined)
    mockConsumePrefetch.mockReturnValue(undefined)
    mockCreateFromFetch.mockReturnValue(
      Promise.resolve({ matches: [{ element: React.createElement('div', null, 'Other') }] }),
    )

    let navigate: (to: string | number) => void
    function NavCapture() {
      navigate = useNavigate() as (to: string | number) => void
      return null
    }

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '[...path]', rsc: true }]} location="/">
          <RscSlot
            initialPayload={{ matches: [{ element: React.createElement('div', null, 'Initial') }] }}
          />
          <NavCapture />
        </RouteProvider>,
      )
    })

    // Navigation effect should NOT fire on first mount when initialPayload is provided
    expect(mockCreateFromFetch).not.toHaveBeenCalled()

    // Navigate — triggers navigation effect
    mockConsumePrefetch.mockReturnValue(undefined)
    await act(async () => {
      navigate('/other')
    })

    expect(mockCreateFromFetch).toHaveBeenCalledTimes(1)
  })

  it('registers setServerCallback on mount', async () => {
    const [{ RouteProvider }, { default: RscSlot }] = await Promise.all([
      import('./core.js'),
      import('./rsc-content.js'),
    ])
    const { setServerCallback } = await import('@vitejs/plugin-rsc/browser')

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '/', rsc: true }]} location="/">
          <RscSlot />
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

    await act(async () => {
      render(
        <RouteProvider routes={[{ path: '/', rsc: true }]} location="/">
          <RscSlot
            initialPayload={{
              matches: [{ element: React.createElement('div', null, 'Hello') }],
              head: { title: 'Page Title' },
            }}
          />
        </RouteProvider>,
      )
    })

    expect(document.title).toBe('Page Title')
  })
})
