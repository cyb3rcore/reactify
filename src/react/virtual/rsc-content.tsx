'use client'

import { useState, useEffect, startTransition, useRef, Component, type ReactNode } from 'react'
import { useRouteContext } from './core.js'
import { consumePrefetch } from './prefetch-cache.js'

interface RscPayload {
  matches?: Array<{ element?: ReactNode }>
  returnValue?: { ok?: boolean; data?: unknown }
  head?: { title?: string }
  formState?: unknown
}

export type { RscPayload }

declare global {
  var __rscSetPayload: ((p: RscPayload) => void) | undefined
}

// Module-level server action callback registration
// Registers before any component mounts — avoids the useEffect race window.
// Uses dynamic import to avoid resolving @vitejs/plugin-rsc/browser's
// virtual: protocol imports during server-side module loading.
if (typeof window !== 'undefined') {
  import('@vitejs/plugin-rsc/browser').then(({ createTemporaryReferenceSet, encodeReply, createFromFetch, setServerCallback }) => {
    const serverCallback = async (id: string, args: unknown[]) => {
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
      const setter = globalThis.__rscSetPayload as ((p: RscPayload) => void) | undefined
      if (setter) {
        startTransition(() => setter(payload))
      }
      const { ok, data } = payload.returnValue ?? {}
      if (!ok) throw data
      return data
    }
    setServerCallback(serverCallback)
  })
}

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
        <div role="alert" style={{ padding: '2rem', fontFamily: 'ui-monospace,monospace', background: '#0d1117', color: '#e6edf3', minHeight: '100vh' }}>
          <h2 style={{ color: '#f85149', margin: 0 }}>RSC Render Error</h2>
          <p style={{ color: '#f85149', fontWeight: 700 }}>{this.state.error.message}</p>
          <pre style={{ background: '#161b22', padding: '1rem', borderRadius: '6px', overflowX: 'auto', fontSize: '.85rem', lineHeight: 1.5 }}>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function RscSlot({ initialPayload }: { initialPayload?: RscPayload | null }) {
  const { location } = useRouteContext()
  const rscUrl = `${location.pathname}_.rsc${location.search}`

  // Start with SSR payload (if available), or null (SPA navigation)
  const [payload, setPayload] = useState<RscPayload | null>(initialPayload ?? null)

  // Expose setter for module-level server action callback
  useEffect(() => {
    globalThis.__rscSetPayload = setPayload
    return () => { delete globalThis.__rscSetPayload }
  }, [])

  const isFirstMount = useRef(true)

  // Navigation: fetch fresh flight data on location change
  // Dynamic import to avoid resolving @vitejs/plugin-rsc/browser's
  // virtual: protocol imports during server-side module loading.
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    let cancelled = false
    const cached = consumePrefetch(location.pathname)
    if (cached) {
      cached.then(p => {
        if (!cancelled) startTransition(() => setPayload(p))
      })
    } else {
      import('@vitejs/plugin-rsc/browser').then(({ createFromFetch }) => {
        if (!cancelled) {
          createFromFetch<RscPayload>(fetch(rscUrl)).then(p => {
            if (!cancelled) startTransition(() => setPayload(p))
          })
        }
      })
    }
    return () => { cancelled = true }
  }, [location.pathname, location.search])

  // Update document title from payload
  useEffect(() => {
    if (payload?.head?.title) {
      document.title = payload.head.title
    }
  }, [payload])

  if (!payload) return null
  return <RscErrorBoundary>{payload.matches?.[0]?.element ?? null}</RscErrorBoundary>
}

// NOTE: setServerCallback was previously re-exported from @vitejs/plugin-rsc/browser
// but is now imported dynamically to avoid virtual: protocol resolution on the server.
// Consumers should import it directly from @vitejs/plugin-rsc/browser if needed.
