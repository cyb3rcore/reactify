# Reactify `<Image>` Component Design

**Date:** 2026-07-16
**Status:** Draft
**Framework:** `@cyb3rcore/reactify`
**Backend:** `@cyb3rcore/sharpify` (on-the-fly image transforms)

---

## Summary

A reactive image component at the framework level that generates responsive `srcset`/`sizes` attributes and delegates image transformation to the sharpify plugin. Patterned after Hydrogen's Image component — lean, predictable, with a `loader` abstraction. Sharpify handles all server-side transforms (resize, format, quality, caching); the Image component handles client-side responsive rendering.

---

## Props API

```ts
interface ImageProps {
  // Required
  src: string
  alt: string

  // Dimension strategy
  // Fixed: provide width → x-descriptors (1x, 2x)
  // Responsive: provide sizes → w-descriptors (400w, 800w)
  // Fill: parent-relative CSS positioning
  width?: number
  height?: number
  fill?: boolean
  sizes?: string

  // Common sharpify params (ergonomic shortcuts)
  quality?: number // default 80, maps to ?q=
  fit?: string // maps to ?fit=
  position?: string // maps to ?pos=

  // Full sharpify access (escape hatch for any transform)
  params?: Record<string, string | number | boolean>

  // Loading strategy
  preload?: boolean // <link rel="preload"> + loading=eager
  loading?: 'lazy' | 'eager' // default: lazy (unless preload)

  // Placeholder
  placeholder?: 'blur' | 'empty' // default: 'empty'
  blurDataURL?: string // tiny blurred image, or auto-generated

  // Passthrough
  loader?: Loader // custom URL builder, defaults to sharpify
  unoptimized?: boolean // skip sharpify, use src as-is
  className?: string
  style?: CSSProperties
  onLoad?: React.ReactEventHandler<HTMLImageElement>
}
```

## Loader contract

```ts
type Loader = (params: { src: string; width: number; quality?: number }) => string
```

**Default sharpify loader:**

```
({ src, width, quality }) => `/images/${src}?w=${width}&q=${quality ?? 80}`
```

---

## Output Modes

### Fixed-width (width is a number)

```tsx
<Image src="hero.jpg" width={400} height={300} quality={80} />
```

→

```html
<img
  src="/images/hero.jpg?w=400&h=300&q=80"
  srcset="/images/hero.jpg?w=400&h=300&q=80 1x, /images/hero.jpg?w=800&h=600&q=80 2x"
  width="400"
  height="300"
  loading="lazy"
  decoding="async"
/>
```

### Responsive (sizes provided)

```tsx
<Image src="hero.jpg" sizes="(max-width: 768px) 100vw, 50vw" quality={80} />
```

→

```html
<img
  src="/images/hero.jpg?w=400&q=80"
  srcset="
    /images/hero.jpg?w=400&q=80   400w,
    /images/hero.jpg?w=800&q=80   800w,
    /images/hero.jpg?w=1200&q=80 1200w
  "
  sizes="(max-width: 768px) 100vw, 50vw"
  loading="lazy"
  decoding="async"
/>
```

### Fill (parent-relative CSS)

```tsx
<Image src="bg.jpg" fill sizes="100vw" preload />
```

→

```html
<link rel="preload" as="image" imagesrcset="/images/bg.jpg?w=640&q=80 640w, ..." />
<img
  src="/images/bg.jpg?w=640&q=80"
  srcset="..."
  sizes="100vw"
  style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
  loading="eager"
  decoding="async"
/>
```

### Escape hatch — `params`

```tsx
<Image src="photo.jpg" width={400} params={{ blur: 5, bw: true, tint: 'FF4400' }} />
```

→

```
src="/images/photo.jpg?w=400&blur=5&bw=true&tint=FF4400"
```

---

## Width generation

### Fixed width → x-descriptors

```
[1x, 2x, 3x] → widths = [width, width * 2, width * 3]
```

### Responsive → w-descriptors

```
[640, 750, 828, 1080, 1200, 1920, 2048, 3840]
```

(configurable as `deviceSizes` via plugin options or loader context)

---

## File Structure

```
src/
  react/
    virtual/
      image.tsx          ← Component implementation
      image.test.tsx     ← Tests
  react/
    plugin/
      index.ts           ← Add Image to virtual module exports
```

## Implementation plan

1. Create `src/react/virtual/image.tsx` as `'use client'` component
2. Add to plugin's virtual module exports (alongside Link)
3. Add tests (unit + rendering)
4. Publish new version via changesets
5. Update template-salam to add sharpify + Image import in scaffolded apps

**Dependencies:** None — pure React component, no sharpify dependency at the framework level. The `loader` is the integration point.
