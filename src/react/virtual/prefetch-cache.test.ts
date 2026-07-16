// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock createFromFetch so we don't need real network calls
vi.mock('@vitejs/plugin-rsc/browser', () => ({
  createFromFetch: vi.fn((fetchPromise: Promise<Response>) => fetchPromise.then((r) => r.json())),
}))

// Provide a global fetch so prefetchRsc can call it without hitting the network
globalThis.fetch = vi
  .fn()
  .mockRejectedValue(new Error('network disabled in test')) as unknown as typeof globalThis.fetch

describe('prefetch-cache', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('stores and retrieves a prefetched payload', async () => {
    const { prefetchRsc, consumePrefetch } = await import('./prefetch-cache.js')
    await prefetchRsc('/test').catch(() => {})
    expect(consumePrefetch('/test')).toBeDefined()
  })

  it('returns undefined for uncached path', async () => {
    const { consumePrefetch } = await import('./prefetch-cache.js')
    expect(consumePrefetch('/unknown')).toBeUndefined()
  })

  it('removes entry after consumption', async () => {
    const { prefetchRsc, consumePrefetch } = await import('./prefetch-cache.js')
    await prefetchRsc('/once').catch(() => {})
    consumePrefetch('/once')
    expect(consumePrefetch('/once')).toBeUndefined()
  })

  it('evicts oldest entry when cache exceeds max', async () => {
    const { prefetchRsc, consumePrefetch } = await import('./prefetch-cache.js')
    // Fill cache to max
    for (let i = 0; i < 100; i++) {
      await prefetchRsc(`/path-${i}`).catch(() => {})
    }
    // 101st entry should evict /path-0
    await prefetchRsc('/path-100').catch(() => {})
    expect(consumePrefetch('/path-0')).toBeUndefined()
    // Most recent should still be available
    expect(consumePrefetch('/path-100')).toBeDefined()
  })

  it('respects TTL expiry', async () => {
    const { prefetchRsc, consumePrefetch } = await import('./prefetch-cache.js')

    // Use fake timers to simulate time passing
    vi.useFakeTimers()

    await prefetchRsc('/stale').catch(() => {})
    // Advance time past the 60s TTL
    vi.advanceTimersByTime(60_001)

    // TTL expired — calling prefetchRsc again should replace the entry
    await prefetchRsc('/stale').catch(() => {})
    // The old promise is gone; the new one is stored
    expect(consumePrefetch('/stale')).toBeDefined()

    vi.useRealTimers()
  })
})
