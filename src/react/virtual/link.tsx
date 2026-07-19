'use client'
import { useCallback, useRef, type ReactNode, type MouseEvent } from 'react'
import { useNavigate } from '../core-shared.js'
import { prefetchRsc } from './prefetch-cache.js'

interface LinkProps {
  to: string
  children: ReactNode
  prefetch?: 'hover' | false
}

export default function Link({ to, children, prefetch = 'hover' }: LinkProps) {
  let navigate: ReturnType<typeof useNavigate>
  try {
    navigate = useNavigate()
  } catch {
    // During SSR, there's no RouteProvider context. Events don't fire during SSR
    // anyway, so a fallback that does direct navigation is sufficient.
    navigate = (to: string | number) => {
      if (typeof to === 'string') window.location.href = to
    }
  }
  const prefetchedRef = useRef(false)

  const doPrefetch = useCallback(() => {
    if (prefetchedRef.current) return
    prefetchedRef.current = true
    prefetchRsc(to)
  }, [to])

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) return
      e.preventDefault()
      navigate(to)
    },
    [to, navigate],
  )

  return (
    <a href={to} onClick={handleClick} onMouseEnter={prefetch !== false ? doPrefetch : undefined}>
      {children}
    </a>
  )
}
