'use client'
import { useSnapshot } from 'valtio'
import { store } from '../context'

export default function UsingStore() {
  const snap = useSnapshot(store)
  return (
    <div>
      <h2>Valtio State Management</h2>
      <p data-testid="valtio-count">Count: {snap.count}</p>
      <p data-testid="valtio-message">Message: {snap.message}</p>
    </div>
  )
}
