'use client'

import { useState, useEffect, Component, startTransition, useRef, useCallback, type ReactNode } from 'react'
import { useRouteContext } from './core.js'

interface RscPayload {
  matches?: Array<{ element?: ReactNode }>
  returnValue?: { ok?: boolean; data?: unknown }
  head?: { title?: string }
  formState?: unknown
}
import {
  createFromFetch,
  setServerCallback,
  createTemporaryReferenceSet,
  encodeReply,
} from '@vitejs/plugin-rsc/browser'

class RscErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('RSC render error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert">
          <h2>RSC Render Error</h2>
          <pre>{this.state.error.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

declare global {
  interface Window {
    __FLIGHT_DATA?: unknown[]
  }
}

/**
 * RSC Content component — renders server components on the client.
 *
 * Uses `useRouteContext().location` (from our custom router) instead of
 * react-router's `useLocation()`. Fetches RSC payloads on navigation
 * and re-renders the React element tree produced by the server.
 */
export default function RscContent() {
  const { location } = useRouteContext()
  const [element, setElement] = useState<ReactNode>(null)
  const [loading, setLoading] = useState(false)

  // Register server action callback once on mount.
  useEffect(() => {
    setServerCallback(async (id: string, args: unknown[]) => {
      const temporaryReferences = createTemporaryReferenceSet()
      const rscUrl = `${window.location.pathname}_.rsc${window.location.search}`
      const payload = await createFromFetch<RscPayload>(
        fetch(rscUrl, {
          method: 'POST',
          headers: { 'x-rsc-action': id },
          body: await encodeReply(args, { temporaryReferences }),
        }),
        { temporaryReferences },
      )
      startTransition(() => {
        setElement(payload.matches?.[0]?.element ?? null)
        setLoading(false)
      })
      const { ok, data } = payload.returnValue ?? {}
      if (!ok) throw data
      return data
    })
  }, [])

  // Fetch RSC content on client navigation (initial hydration handled by mount.js)
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const rscUrl = `${location.pathname}_.rsc${location.search}`
    createFromFetch<RscPayload>(fetch(rscUrl)).then((payload) => {
      if (!cancelled) {
        startTransition(() => {
          setElement(payload.matches?.[0]?.element ?? null)
          setLoading(false)
        })
        if (payload?.head?.title) {
          document.title = payload.head.title
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search])

  // Only show loading on initial render, not on client navigation
  if (loading && !element) {
    return <div className="rsc-loading">Loading...</div>
  }

  return <RscErrorBoundary>{element}</RscErrorBoundary>
}

/**
 * Hook to call a server action by path. Kept as a named export to satisfy
 * the re-export from `./core.tsx`.
 */
export function useServerAction(
  path: string,
  options?: Record<string, unknown>,
): () => Promise<unknown> {
  const ref = useRef<AbortController | null>(null)
  return useCallback(async () => {
    if (ref.current) ref.current.abort()
    ref.current = new AbortController()
    const res = await fetch(path, { ...options, signal: ref.current.signal })
    if (!res.ok) throw new Error(`Server action failed: ${res.status}`)
    return res.json()
  }, [path, options])
}
