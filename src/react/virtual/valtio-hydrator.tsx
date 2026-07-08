import type { ReactNode } from 'react'

interface ValtioHydratorProps {
  state: unknown
  children: ReactNode
}

/**
 * Wraps the RSC element tree with Valtio state that gets serialized
 * alongside the RSC flight data. On the client, the state snapshot is
 * rehydrated so that useSnapshot() works on the matching proxy.
 *
 * This is intentionally a simple pass-through on the server — the actual
 * Valtio Provider wiring happens in the user's app entry (create.tsx).
 * The key function is that snapshot() is called here so the proxy state
 * is captured in the RSC payload for client-side hydration.
 */
export default function ValtioHydrator({ state, children }: ValtioHydratorProps) {
  return <>{children}</>
}
