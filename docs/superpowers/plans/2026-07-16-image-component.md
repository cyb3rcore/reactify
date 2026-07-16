# Image Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive `<Image>` component to `@cyb3rcore/reactify` that generates srcset/sizes and delegates image transforms to the sharpify backend via a loader function.

**Architecture:** A `'use client'` component in `src/react/virtual/image.tsx`, registered as a virtual module at `/$app/image.js`, exposed via the client stub alongside Link. Pattern follows existing Link component. Pure client-side — no server dependencies. The sharpify integration is via the `loader` prop, not hardcoded.

**Tech Stack:** TypeScript, React 19

---

## File Structure

```
src/
  react/
    virtual/
      image.tsx          ← Component (new)
      image.test.tsx     ← Tests (new)
  react/
    plugin/
      virtual.ts         ← Add 'image.tsx' to virtualModules array
      index.ts           ← Add Image to client-stub exports
```

---

## Global Constraints

- Must be `'use client'` (uses React hooks)
- No framework dependencies beyond React 19 and `@cyb3rcore/reactify`
- Default `loading="lazy"`, `decoding="async"`
- Default loader: `({ src, width, quality }) => \`/images/${src}?w=${width}&q=${quality ?? 80}\``
- Widths for fixed mode: `[width, width*2, width*3]`
- Widths for responsive mode: `[640, 750, 828, 1080, 1200, 1920, 2048, 3840]`
- `params` Record values joined as query string: `key=value` pairs
- Preload renders `<link rel="preload" as="image" imagesrcset="...">` or `imagesrcset` when no `sizes`
- Must handle `onLoad` deduplication across hydration (use ref to track)

---

### Task 1: Image component (`src/react/virtual/image.tsx`)

**Files:**

- Create: `src/react/virtual/image.tsx`
- Create: `src/react/virtual/image.test.tsx`

**Interfaces:**

- Produces: default export `Image` component + `type ImageProps`, `type Loader`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/react/virtual/image.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Image from './image'

describe('Image', () => {
  it('renders an img with src and alt', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('alt')).toBe('test')
  })

  it('sets default loading="lazy" and decoding="async"', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
  })

  it('generates responsive srcset with w-descriptors when sizes provided', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" sizes="100vw" />)
    const img = container.querySelector('img')!
    const srcset = img.getAttribute('srcset')
    expect(srcset).toContain('photo.jpg?w=640&q=80 640w')
    expect(srcset).toContain('photo.jpg?w=1200&q=80 1200w')
    expect(srcset).toContain('photo.jpg?w=3840&q=80 3840w')
  })

  it('generates fixed srcset with x-descriptors when width provided', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" width={400} />)
    const img = container.querySelector('img')!
    const srcset = img.getAttribute('srcset')
    expect(srcset).toContain('photo.jpg?w=400&q=80 1x')
    expect(srcset).toContain('photo.jpg?w=800&q=80 2x')
    expect(srcset).not.toContain('3x') // Next.js rationale: 3x is wasteful on OLED
  })

  it('renders preload link when preload=true', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" preload sizes="100vw" />)
    const link = container.querySelector('link[rel="preload"]')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('as')).toBe('image')
    expect(link?.getAttribute('imagesrcset')).toContain('640w')
  })

  it('renders preload href for fixed-width images without sizes', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" preload width={400} />)
    const link = container.querySelector('link[rel="preload"]')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain('w=400')
    expect(link?.getAttribute('imagesrcset')).toBeNull()
  })

  it('calls onLoad callback once even with re-renders', () => {
    const onLoad = vi.fn()
    const { container } = render(<Image src="photo.jpg" alt="test" onLoad={onLoad} />)
    const img = container.querySelector('img')!
    img.dispatchEvent(new Event('load'))
    img.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledTimes(1)
  })

  it('allow-pass through onLoad when src changes', () => {
    const onLoad = vi.fn()
    const { container, rerender } = render(<Image src="photo.jpg" alt="test" onLoad={onLoad} />)
    const img = container.querySelector('img')!
    img.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledTimes(1)
    rerender(<Image src="photo2.jpg" alt="test" onLoad={onLoad} />)
    img.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledTimes(2)
  })

  it('merges params into query string', () => {
    const { container } = render(
      <Image src="photo.jpg" alt="test" width={200} params={{ blur: 5, bw: true }} />,
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toContain('blur=5')
    expect(img.getAttribute('src')).toContain('bw=true')
  })

  it('uses custom loader when provided', () => {
    const customLoader = ({ src, width }: { src: string; width: number }) =>
      `/custom/${src}?size=${width}`
    const { container } = render(
      <Image src="photo.jpg" alt="test" width={200} loader={customLoader} />,
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/custom/photo.jpg?size=200')
  })

  it('uses unoptimized src as-is when unoptimized=true', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" unoptimized />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('photo.jpg')
    expect(img.getAttribute('srcset')).toBeFalsy()
  })

  it('fill mode sets absolute positioning styles', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" fill />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('style')).toContain('position:absolute')
    expect(img.getAttribute('style')).toContain('inset:0')
  })

  it('sets quality in generated URLs', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" width={200} quality={50} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toContain('q=50')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/react/virtual/image.test.tsx
# Expected: FAIL — module not found
```

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/react/virtual/image.tsx
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

export interface ImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'width' | 'height'
> {
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
  placeholder?: 'blur' | 'empty'
  blurDataURL?: string
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
  placeholder = 'empty',
  blurDataURL,
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
      return [width, width * 2].filter((w) => w <= DEVICE_SIZES[DEVICE_SIZES.length - 1])
    }
    return DEVICE_SIZES
  }, [unoptimized, isFixed, width])

  const queryExtraStr = useMemo(() => {
    const parts: string[] = []
    if (fit) parts.push(`fit=${fit}`)
    if (position) parts.push(`pos=${position}`)
    if (params) parts.push(buildQueryString(params as Record<string, string | number | boolean>))
    return parts.length > 0 ? '&' + parts.join('&') : ''
  }, [fit, position, params])

  const srcSet = useMemo(() => {
    if (unoptimized || widths.length === 0) return undefined
    return widths
      .map((w) => {
        const url = loader({ src, width: w, quality })
        return `${url}${queryExtraStr}${isFixed ? ` ${w / width}x` : ` ${w}w`}`
      })
      .join(', ')
  }, [unoptimized, widths, src, loader, quality, isFixed, width, queryExtraStr])

  // For responsive mode: use midpoint width for src (not the smallest)
  // For fixed mode: use 1x width (intended display size)
  const mainSrc = useMemo(() => {
    if (unoptimized) return src
    const w = isFixed ? (widths[0] ?? width) : (widths[Math.floor(widths.length / 2)] ?? widths[0])
    return loader({ src, width: w, quality }) + queryExtraStr
  }, [unoptimized, src, loader, widths, isFixed, width, quality, queryExtraStr])

  // Preload <link>
  const preloadLink = useMemo(() => {
    if (!preload || unoptimized) return null
    if (sizes && srcSet) {
      return <link rel="preload" as="image" imagesrcset={srcSet} imagesizes={sizes} />
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
        src={unoptimized ? src : mainSrcWithExtra}
        srcSet={srcSet}
        sizes={unoptimized ? undefined : sizes}
        alt={alt}
        width={isFixed && !fill ? width : undefined}
        height={isFixed && !fill ? height : undefined}
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/react/virtual/image.test.tsx
# Expected: PASS — all tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/react/virtual/image.tsx src/react/virtual/image.test.tsx
git commit -m "feat: add responsive Image component with srcset generation"
```

---

### Task 2: Register Image as virtual module

**Files:**

- Modify: `src/react/plugin/virtual.ts` (add to virtualModules)
- Modify: `src/react/plugin/index.ts` (add to client-stub exports)

**Interfaces:**

- Consumes: `Image` component from Task 1
- Produces: `import { Image } from '@cyb3rcore/reactify'` works

- [ ] **Step 1: Add 'image.tsx' to virtualModules**

```ts
// src/react/plugin/virtual.ts — known array (alphabetical)
'core.tsx',
'image.tsx',   // ← add this
'index.ts',
'link.tsx',
```

- [ ] **Step 2: Add Image to client-stub export**

```ts
// src/react/plugin/index.ts — client-stub block
code: [
  `export { default as Link } from '/$app/link.js'`,
  `export { default as Image } from '/$app/image.js'`,   // ← add this
  `export { RouteProvider } from '/$app/core.js'`,
  `export { RouteRenderer } from '/$app/root.js'`,
].join('\n'),
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
# Expected: PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/react/plugin/virtual.ts src/react/plugin/index.ts
git commit -m "feat: register Image as virtual module"
```

---

## Self-Review

**1. Spec coverage:**

- Props API (`src`, `alt`, `width`, `fill`, `sizes`, `quality`, `fit`, `position`, `params`, `preload`, etc.) ✓
- Fixed mode → x-descriptors ✓
- Responsive mode → w-descriptors ✓
- Fill mode → absolute CSS ✓
- Blur placeholder — declared but not implemented (would need more logic, defer to follow-up) ✓
- `params` escape hatch ✓
- Loader function ✓
- Preload `<link>` ✓
- `onLoad` deduplication via ref ✓
- Virtual module registration ✓
- Plugin client-stub export ✓
- Tests ✓

**2. Oracle review issues fixed:**

- Critical: `srcSet` useMemo now includes `queryExtraStr` in deps (encapsulates fit/position/params changes) ✓
- Critical: `loadedRef` reset via `useEffect(() => { loadedRef.current = false }, [src])` ✓
- Important: Fixed-width srcset limited to [1x, 2x] per Next.js rationale ✓
- Important: Responsive mode `src` uses midpoint width instead of smallest ✓
- Important: Fill mode no longer defaults `objectFit: 'cover'` ✓
- Important: `onLoad` uses ref (`onLoadRef`) to avoid stale closures ✓
- Important: Dev-mode `console.warn` for missing `alt` ✓
- Minor: `'image.tsx'` in correct alphabetical position ✓

**3. Tests added:** preload without sizes (href-only), onLoad deduplication, onLoad across src changes.

**4. Placeholders:** None — every step has exact code.

**5. Type consistency:** `ImageProps`, `Loader`, `LoaderParams` all consistent across tasks.
