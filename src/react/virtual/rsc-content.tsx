'use client'

import { useState, useEffect, startTransition, useRef, Component, type ReactNode } from 'react'
import { useRouteContext } from './core.js'
import { consumePrefetch } from './prefetch-cache.js'
import {
  createFromFetch,
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from '@vitejs/plugin-rsc/browser'

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
if (typeof window !== 'undefined') {
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
        <div role="alert">
          <h2>RSC Render Error</h2>
          <pre>{this.state.error.message}</pre>
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
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    let cancelled = false
    const cached = consumePrefetch(location.pathname)
    const promise = cached ?? createFromFetch<RscPayload>(fetch(rscUrl))
    promise.then(p => {
      if (!cancelled) {
        startTransition(() => setPayload(p))
      }
    })
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

// Re-export for use from other modules
export { setServerCallback }
