import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouteProvider, type RouteDef } from './core'
import { RouteRenderer } from './root'

// Detect RSC flight data for server component hydration
const flightData =
  typeof window !== 'undefined' && window.__FLIGHT_DATA

// Mount entry point. The app entry point (create.tsx or similar) assembles
// the RouteProvider + RouteRenderer with the actual route table.
// This file exports the hydration logic for consumer applications.
export function mount(routes: RouteDef[], rootId = 'root') {
  if (flightData) {
    // RSC hydration path — skip traditional routing hydration
    return
  }

  hydrateRoot(
    document.getElementById(rootId)!,
    <StrictMode>
      <RouteProvider routes={routes}>
        <RouteRenderer />
      </RouteProvider>
    </StrictMode>
  )
}
