import { createFromFetch } from '@vitejs/plugin-rsc/browser'

export interface RscPayload {
  matches?: Array<{ element?: React.ReactNode }>
  head?: { title?: string }
  formState?: unknown
  returnValue?: { ok?: boolean; data?: unknown }
}

interface CacheEntry {
  payload: Promise<RscPayload>
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const TTL = 60_000
const MAX_ENTRIES = 100

export function prefetchRsc(path: string): Promise<RscPayload> | undefined {
  const key = path
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < TTL) {
    return cached.payload
  }
  if (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  const promise = createFromFetch<RscPayload>(fetch(`${path}_.rsc`))
  cache.set(key, { payload: promise, timestamp: Date.now() })
  return promise
}

export function consumePrefetch(path: string): Promise<RscPayload> | undefined {
  const key = path
  const cached = cache.get(key)
  if (!cached) return undefined
  cache.delete(key)
  return cached.payload
}
