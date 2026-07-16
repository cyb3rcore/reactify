'use client'
import { useMemo, useEffect, useRef, type ImgHTMLAttributes, type CSSProperties } from 'react'

const DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840]

type LoaderParams = { src: string; width: number; quality?: number }
export type Loader = (params: LoaderParams) => string

function defaultLoader({ src, width, quality }: LoaderParams): string {
  return `/images/${src}?w=${width}&q=${quality ?? 80}`
}

function buildQueryString(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
}

export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'width' | 'height'> {
  src: string
  alt: string
  width?: number
  height?: number
  fill?: boolean
  sizes?: string
  quality?: number
  fit?: string
  position?: string
  params?: Record<string, string | number | boolean>
  preload?: boolean
  unoptimized?: boolean
  loader?: Loader
}

export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  sizes,
  quality = 80,
  fit,
  position,
  params,
  preload = false,
  loading = 'lazy',
  unoptimized = false,
  loader = defaultLoader,
  className,
  style,
  onLoad,
  decoding = 'async',
  ...rest
}: ImageProps) {
  // Dev-mode warning for missing alt text
  if (process.env.NODE_ENV === 'development' && !alt) {
    console.warn('Image component requires an alt prop for accessibility')
  }

  const loadedRef = useRef(false)

  const isFixed = width !== undefined

  const widths = useMemo(() => {
    if (unoptimized) return []
    if (isFixed) {
      // Next.js rationale: 3x is wasteful on OLED, 2x is the practical ceiling
      return [width, width * 2].filter(w => w <= DEVICE_SIZES[DEVICE_SIZES.length - 1])
    }
    return DEVICE_SIZES
  }, [unoptimized, isFixed, width])

  const queryExtraStr = useMemo(() => {
    const parts: string[] = []
    if (fit) parts.push(`fit=${fit}`)
    if (position) parts.push(`pos=${position}`)
    if (params) parts.push(buildQueryString(params))
    return parts.length > 0 ? '&' + parts.join('&') : ''
  }, [fit, position, params])

  const srcSet = useMemo(() => {
    if (unoptimized || widths.length === 0) return undefined
    return widths
      .map(w => {
        const url = loader({ src, width: w, quality })
        return `${url}${queryExtraStr}${isFixed ? ` ${w / width}x` : ` ${w}w`}`
      })
      .join(', ')
  }, [unoptimized, widths, src, loader, quality, isFixed, width, queryExtraStr])

  // For responsive mode: use midpoint width for src (not the smallest)
  // For fixed mode: use 1x width (intended display size)
  const mainSrc = useMemo(() => {
    if (unoptimized) return src
    const w = isFixed
      ? (widths[0] ?? width)
      : (widths[Math.floor(widths.length / 2)] ?? widths[0])
    return loader({ src, width: w, quality }) + queryExtraStr
  }, [unoptimized, src, loader, widths, isFixed, width, quality, queryExtraStr])

  // Preload <link>
  const preloadLink = useMemo(() => {
    if (!preload || unoptimized) return null
    if (sizes && srcSet) {
      return (
        <link
          rel="preload"
          as="image"
          imageSrcSet={srcSet}
          imageSizes={sizes}
        />
      )
    }
    return <link rel="preload" as="image" href={mainSrc} />
  }, [preload, unoptimized, srcSet, sizes, mainSrc])

  const resolvedLoading = preload ? 'eager' : loading

  const imgStyle: CSSProperties = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }
    : { ...style }

  // Reset loaded state when src changes (for galleries etc.)
  useEffect(() => {
    loadedRef.current = false
  }, [src])

  // Use ref for onLoad to avoid stale closures
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (loadedRef.current) return
    loadedRef.current = true
    onLoadRef.current?.(e)
  }

  return (
    <>
      {preloadLink}
      <img
        src={unoptimized ? src : mainSrc}
        srcSet={srcSet}
        sizes={unoptimized ? undefined : sizes}
        alt={alt}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        loading={resolvedLoading}
        decoding={decoding}
        className={className}
        style={imgStyle}
        onLoad={handleLoad}
        {...rest}
      />
    </>
  )
}
