import { useCallback, useRef, type ReactNode, type MouseEvent } from 'react'
import { useNavigate } from './core.js'
import { prefetchRsc } from './prefetch-cache.js'

interface LinkProps {
  to: string
  children: ReactNode
  prefetch?: 'hover' | false
}

export default function Link({ to, children, prefetch = 'hover' }: LinkProps) {
  const navigate = useNavigate()
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
    <a
      href={to}
      onClick={handleClick}
      onMouseEnter={prefetch !== false ? doPrefetch : undefined}
    >
      {children}
    </a>
  )
}
