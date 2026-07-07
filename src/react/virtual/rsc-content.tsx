// RSC content — server action bridge
import { useRef, useCallback } from 'react'

export function useServerAction(path: string, options?: Record<string, any>): () => Promise<any> {
  const ref = useRef<AbortController | null>(null)
  return useCallback(async () => {
    if (ref.current) ref.current.abort()
    ref.current = new AbortController()
    const res = await fetch(path, { ...options, signal: ref.current.signal })
    if (!res.ok) throw new Error(`Server action failed: ${res.status}`)
    return res.json()
  }, [path, options])
}
