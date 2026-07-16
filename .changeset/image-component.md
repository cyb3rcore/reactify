---
'@cyb3rcore/reactify': minor
---

Add responsive `<Image>` component with srcset generation + fix release workflow

### Changes

Adds a framework-level `Image` component (same pattern as the existing `Link` component) that generates responsive `srcset`/`sizes` attributes and delegates image transforms to a backend via a customizable `loader` function.

**Commits:**

- [`d8eeaab5`](https://github.com/cyb3rcore/reactify/commit/d8eeaab5) — feat: add responsive Image component with srcset generation
- [`c88bace5`](https://github.com/cyb3rcore/reactify/commit/c88bace5) — feat: register Image as virtual module
- [`b100cc5c`](https://github.com/cyb3rcore/reactify/commit/b100cc5c) — fix: remove unused placeholder props, export ImageProps, fix responsive width/height
- [`f5fb45eb`](https://github.com/cyb3rcore/reactify/commit/f5fb45eb) — fix: use GH_TOKEN for changesets checkout, add github-token input
- [`7313f917`](https://github.com/cyb3rcore/reactify/commit/7313f917) — fix: use imageSrcSet/imageSizes camelCase for React JSX

### Image component features

- **Responsive srcset** — generates `w`-descriptors (640w–3840w) when `sizes` prop is provided
- **Fixed-width srcset** — generates `x`-descriptors (1x, 2x) when `width` prop is a number
- **Preload support** — renders `<link rel="preload" as="image">` for LCP images via `preload` prop
- **Custom loader** — `loader` function for URL generation, defaults to `/images/{src}?w={width}&q={quality}`
- **Params escape hatch** — `params` record passthrough for any backend transform operation
- **Fill mode** — `fill` prop for parent-relative CSS positioning
- **Loading strategy** — defaults to `loading="lazy"`, `decoding="async"`; `loading="eager"` when `preload` is set
- **onLoad deduplication** — guards against double-firing across hydration boundaries
- **Dev warnings** — warns when `alt` is missing (dev mode only)
- **Virtual module** — registered as `/$app/image.js`, exported via `import { Image } from '@cyb3rcore/reactify'`
