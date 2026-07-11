'use client'

import { useState, useEffect, use, startTransition, useRef, Component, type ReactNode } from 'react'
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
  var __rscSetPayloadPromise: ((p: Promise<RscPayload>) => void) | undefined
}

// Module-level server action callback registration
// Registers before any component mounts — avoids the useEffect race window.
// The callback receives the action ID and args, POSTs to the _.rsc endpoint,
// and updates the RscSlot component via the module-level setter ref.
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
    const setter = globalThis.__rscSetPayloadPromise as ((p: Promise<RscPayload>) => void) | undefined
    if (setter) {
      startTransition(() => setter(Promise.resolve(payload)))
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

export default function RscSlot({ initialRscPromise }: { initialRscPromise?: Promise<RscPayload> }) {
  const { location } = useRouteContext()
  const rscUrl = `${location.pathname}_.rsc${location.search}`

  // Start with initial SSR promise, or fetch direct if no SSR data
  const [payloadPromise, setPayloadPromise] = useState<Promise<RscPayload>>(
    () => initialRscPromise ?? createFromFetch(fetch(rscUrl)),
  )

  // Expose setter for module-level server action callback
  useEffect(() => {
    globalThis.__rscSetPayloadPromise = setPayloadPromise
    return () => { delete globalThis.__rscSetPayloadPromise }
  }, [])

  const isFirstMount = useRef(true)

  // Navigation: check prefetch cache, fall back to fetch
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    const cached = consumePrefetch(location.pathname)
    const promise = cached ?? createFromFetch(fetch(rscUrl))
    setPayloadPromise(promise)
  }, [location.pathname, location.search])

  // Suspense — React preserves SSR HTML while promise is pending
  const payload = use(payloadPromise)

  // Update document title from payload
  useEffect(() => {
    if (payload?.head?.title) {
      document.title = payload.head.title
    }
  }, [payload])

  return <RscErrorBoundary>{payload.matches?.[0]?.element ?? null}</RscErrorBoundary>
}

// Re-export for use from other modules
export { setServerCallback }
