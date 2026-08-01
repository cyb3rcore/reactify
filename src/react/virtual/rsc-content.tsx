'use client'

import { useState, useEffect, useCallback, startTransition, useRef, Component, type ReactNode } from 'react'
import { useRouteContext } from './core.js'
import { consumePrefetch } from './prefetch-cache.js'
import { matchSerializedRoute, createRefreshSequencer } from '../hmr-client.js'

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
  import('@vitejs/plugin-rsc/browser').then(
    ({ createTemporaryReferenceSet, encodeReply, createFromFetch, setServerCallback }) => {
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
    },
  )
}

// Fetch and decode the Flight payload for a given URL.
// Dynamic import to avoid resolving @vitejs/plugin-rsc/browser's
// virtual: protocol imports during server-side module loading.
async function fetchRscPayload(rscUrl: string): Promise<RscPayload> {
  const { createFromFetch } = await import('@vitejs/plugin-rsc/browser')
  return createFromFetch<RscPayload>(fetch(rscUrl))
}

// Vite client HMR for server-module changes.
// @vitejs/plugin-rsc emits 'rsc:update' when an RSC server module changes.
// Registered at module scope so the listener exists before hydration
// completes — a component effect would race the dev-server broadcast on
// cold starts. The callback reads the current location at event time, and
// commits through the active RscSlot setter (globalThis.__rscSetPayload),
// queuing the payload for the first mount if no component is mounted yet.
let queuedRefresh: { pathname: string; payload: RscPayload } | null = null
const refreshSeq = createRefreshSequencer()

if (import.meta.hot && typeof window !== 'undefined') {
  const onRscUpdate = () => {
    // Non-RSC routes are refreshed in place by core.tsx (file-gated); RSC
    // routes re-fetch the Flight stream. The fetch is intentionally NOT
    // gated on the edited file: any server-module change (including shared
    // components/layouts) must re-render the current RSC route. Routes that
    // can't be matched default to the RSC path.
    const routeMatch = matchSerializedRoute(window.location.pathname)
    if (routeMatch && !routeMatch.route.rsc) return
    const seq = refreshSeq.next()
    const rscUrl = `${window.location.pathname}_.rsc${window.location.search}`
    fetchRscPayload(rscUrl)
      .then((payload) => {
        if (!refreshSeq.isCurrent(seq)) return
        const setter = globalThis.__rscSetPayload as ((p: RscPayload) => void) | undefined
        if (setter) {
          startTransition(() => setter(payload))
        } else {
          queuedRefresh = { pathname: window.location.pathname, payload }
        }
      })
      .catch((error: unknown) => {
        if (refreshSeq.isCurrent(seq)) {
          console.error('[rsc-content] RSC refresh error:', error)
        }
      })
  }
  import.meta.hot.on('rsc:update', onRscUpdate)
  import.meta.hot.dispose(() => {
    import.meta.hot?.off('rsc:update', onRscUpdate)
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
        <div
          role="alert"
          style={{
            padding: '2rem',
            fontFamily: 'ui-monospace,monospace',
            background: '#0d1117',
            color: '#e6edf3',
            minHeight: '100vh',
          }}
        >
          <h2 style={{ color: '#f85149', margin: 0 }}>RSC Render Error</h2>
          <p style={{ color: '#f85149', fontWeight: 700 }}>{this.state.error.message}</p>
          <pre
            style={{
              background: '#161b22',
              padding: '1rem',
              borderRadius: '6px',
              overflowX: 'auto',
              fontSize: '.85rem',
              lineHeight: 1.5,
            }}
          >
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function RscSlot({ initialPayload }: { initialPayload?: RscPayload | null }) {
  const { location } = useRouteContext()
  const rscUrl = `${location.pathname}_.rsc${location.search}`

  // Fetch fresh flight data for the current URL.
  const loadRscPayload = useCallback((): Promise<RscPayload> => fetchRscPayload(rscUrl), [rscUrl])

  // Start with SSR payload (if available), or null (SPA navigation)
  const [payload, setPayload] = useState<RscPayload | null>(initialPayload ?? null)

  // Expose setter for module-level server action callback.
  // Also consumes any Flight payload queued by the module-level 'rsc:update'
  // listener while no component was mounted (i.e. before hydration).
  useEffect(() => {
    globalThis.__rscSetPayload = setPayload
    if (queuedRefresh && queuedRefresh.pathname === location.pathname) {
      const payload = queuedRefresh.payload
      queuedRefresh = null
      startTransition(() => setPayload(payload))
    }
    return () => {
      delete globalThis.__rscSetPayload
    }
  }, [location.pathname])

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
      cached.then((p) => {
        if (!cancelled) startTransition(() => setPayload(p))
      })
    } else {
      loadRscPayload().then((p) => {
        if (!cancelled) startTransition(() => setPayload(p))
      })
    }
    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search, loadRscPayload])

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
