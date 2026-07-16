# @cyb3rcore/reactify

## 1.2.0

### Minor Changes

- cc8be35: Add responsive `<Image>` component with srcset generation + fix release workflow

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

## 1.1.0

### Minor Changes

- feat: add redirect() utility for onEnter lifecycle hooks

  Adds a throw-based `redirect(to, status?)` utility that produces HTTP 3xx
  responses from page `onEnter` hooks without rendering page content. The
  `RedirectError` is caught at three boundaries:

  - **SSR**: Fastify preHandler re-throws → error handler produces 302 response
  - **RSC via onEnter**: extractOnEnter re-throws → handler catch block returns
    302 Response with Location header
  - **Server actions**: Server action catch blocks re-throw → outer handler
    returns 302 Response

  The SSR pipeline (sendResponse, ssr-entry.tsx generateHTML) already handled
  3xx responses correctly — no changes needed there.

  Also includes `isRedirectError()` type guard for safe detection across
  Vite module boundaries (uses duck-type digest check, not instanceof).

  Exports from: @cyb3rcore/reactify, @cyb3rcore/reactify/server, and
  @cyb3rcore/reactify/renderer.

## 1.0.11

### Patch Changes

- fix: deduplicate virtual module IDs by stripping file extension (6bc9ab1f)

  normalizeVirtualModuleId only normalized .jsx/.tsx → .js, but left .js
  extensions intact. When the same source file was imported as `$app/core`
  (from app code) vs `./core.js` (from within virtual modules like create.tsx),
  Vite created separate module instances with different createContext(null)
  calls. This caused routing hooks (useNavigate, useParams, useRouteData)
  to read from a different RouterCtx than the one provided by RouteProvider,
  throwing "useRouteContext must be used within a RouteProvider" on both SSR
  and client-side hydration for any SSR page using these hooks.

  Fix by stripping any file extension so all import variations of the same
  virtual module resolve to the same Vite module ID.

- feat: add RSC escape hatch for useParams via global symbol bridge (c2376427)

  RSC server components render without a RouteProvider wrapping the element
  tree, so useParams() can't read params from React context. Read them from
  the globalThis symbol populated by rsc-entry.tsx via setSyncContext()
  instead, matching the existing bridge in rsc-context.ts.

- refactor: type route and rendering API with ClientModule (6cd18236)

  createRenderFunction, createRoute, and createErrorHandler now use typed
  ClientRouteArgs/CreateRouteArgs instead of inline or generic types.
  hmrClient type tightened from unknown to ClientModule | undefined.

## 1.0.10

### Patch Changes

- fix: use package.json browser export condition instead of plugin intercept (29cb8851)

  Replace the plugin-level load-hook intercept approach with Vite 8's native
  `exports` field `browser` condition. The RSC plugin's `order:pre`
  resolveId intercepts all bare imports before our plugin's resolveId fires,
  and the load-hook approach caused Vite 8 module cache collisions across
  all packages' dist/index.js paths.

  Vite 8 includes `"browser"` in `defaultClientConditions`, so when
  resolving `@cyb3rcore/reactify` for the browser, Vite naturally uses
  `dist/client-index.js` which only exports browser-safe modules
  (Link, RouteProvider, RouteRenderer). No plugin intercepts needed.

## 1.0.9

### Patch Changes

- fix: strip Vite version hash in load-hook path check (5059a8a4)

  Vite appends `?v=` cache-busting hashes to module URLs from pnpm/npm
  registries, causing `endsWith('/dist/index.js')` in the load-hook client
  intercept to miss the actual path `/dist/index.js?v=24fc5805`. The real
  `dist/index.js` with its `node:fs` re-export chain was served to the
  browser instead of the client stub.

  Fix: strip query parameters before the path-suffix check.

## 1.0.8

### Patch Changes

- fix: intercept ESM re-export chain to prevent node:fs crash in client browser

  dist/index.js uses static ESM re-exports that create a resolution chain
  leading to dist/vite/config/paths.js which imports node:fs. When a client
  component imports from @cyb3rcore/reactify, Vite follows this chain and
  tries to serve paths.js to the browser, crashing on node:fs externalization.

  Changes:

  - resolveId: intercepts @cyb3rcore/reactify in client environment, returns
    a browser-safe stub that only re-exports Link, RouteProvider, RouteRenderer
    from virtual module paths ($app/link.js, $app/core.js, $app/root.js)
  - load: safety net intercept when resolveId doesn't fire (e.g. @vitejs/plugin-rsc
    resolves the import first) — catches physical dist/index.js path and returns
    the client stub
  - Uses this.environment from Vite 8's PluginContext instead of a stale closure
    variable; unbinds load hook so this.environment resolves correctly
  - Registers link.tsx in virtual modules array so the client stub can resolve
    $app/link.js

- fix: SSR-safe Link component, HMR preamble injection, and misc improvements

  - Link: wraps useNavigate() in try/catch so the component renders without
    RouteProvider context during SSR (falls back to window.location.href)
  - ssr-entry: injects Vite React Refresh preamble into loaded HTML templates
    to prevent $RefreshSig$() crash during ESM evaluation
  - index.ts: exports RouteProvider and RouteRenderer from package entry
  - vite/config.ts: adds @vite-ignore to dynamic import() for renderer package
  - vite/config/defaults.ts: guards process.argv access with typeof check
  - e2e: expands test coverage for Link component (rendering, prefetch on hover,
    prefetch=false, click navigation, cross-RSC/non-RSC navigation, prefetch
    persistence after client-side nav, flash-free content loading)

## 1.0.7

### Patch Changes

- feat: RSC route params — pass params as props to server component pages

  RSC pages (export const rsc = true) can now receive route params via
  standard React props instead of calling useParams() which crashes in
  the RSC server environment (React hooks are unavailable).

  Changes:

  - rsc-context.ts: Added params to RscContext interface, exported getParams()
  - rsc-entry.tsx: Passes req.params through setSyncContext() and matchResult.params
    as props to createElement(pageModule.default, { params })

## 1.0.6

### Patch Changes

- fix: add src/client/index.html to loadHtmlTemplate candidates for projects with vite root subdirectory
  fix: replace Youch with safe inline error pages in routing.ts
  fix: add renderErrorPage() export for testable error page generation
  test: 9 new tests for rsc-entry error handler + 3 new routing error handler tests

## 1.0.6

### Patch Changes

- fix: replace Youch with safe inline error pages, hide stack traces in production

  - routing.ts: Removed static Youch import, replaced with inline error page
    (dev shows stack, production returns empty body — was already doing this)
  - rsc-entry.tsx: Error page now only shows stack trace in dev mode.
    In production, a generic "500 — Internal Server Error" page is shown
    to prevent leaking file paths and server internals.

## 1.0.5

### Patch Changes

- fix: add guard against rsc: true + getData() conflict

  getRouteModuleExports now throws when a route module exports both rsc: true
  and getData() — they are mutually exclusive since RSC routes use server
  components for data fetching instead of the getData lifecycle hook.

## 1.0.4

### Patch Changes

- feat: export Link component from package entry

  The `<Link>` component with hover prefetch is now importable from the main
  package entry: `import { Link } from '@cyb3rcore/reactify'`. It prefetches
  RSC flight data on hover (via the prefetch cache) and navigates via SPA
  on click.

## 1.0.3

### Patch Changes

- fix: resolve runtime errors from linked package development setup

  Four coordinated fixes for issues that only appear when consuming reactify
  via pnpm link: override (local development):

  - **SSR React resolution** — rendering.ts now uses createRequire pointed at
    the consumer's project root to resolve react-dom/server, preventing
    "Invalid hook call" from mismatched React instances between Vite's SSR
    module runner (consumer's React) and Node.js ESM resolution (framework's
    React).

  - **Virtual module resolution** — browser-only imports (@vitejs/plugin-rsc
    /browser) converted to dynamic imports in rsc-content.tsx and
    prefetch-cache.ts to prevent "virtual:" protocol crash in server code.

  - **Transitive dependency resolution** — added Vite alias for rsc-html-stream
    and devalue resolved from the framework's node_modules, fixing resolution
    failures when pnpm link: doesn't hoist transitive deps.

  - **Error page rendering** — removed Youch dependency from the RSC error
    handler (import fails from virtual modules with no physical file path).
    Replaced with styled inline HTML error page showing full stack traces.
    Client-side RscErrorBoundary also shows full `.stack` trace.

  - **React deduplication** — resolve.dedupe for react/react-dom across all
    Vite environments + configEnvironment hook to filter React from SSR/RSC
    noExternal. react/react-dom moved from dependencies to peerDependencies.

## 1.0.2

### Patch Changes

- fix: infinite remount loop in RscSlot caused by use() + React.lazy + Suspense

  RscSlot used `use(payloadPromise)` inside a React.lazy component, nested in
  a Suspense boundary. When `use()` suspends on a pending promise, React
  **unmounts and remounts** the lazy component's content on each retry. Each
  remount re-runs the useState initializer, creating a new fetch, causing an
  infinite loop of `GET /page_.rsc` requests (~15ms apart).

  Root cause identified via agent-browser console logging showing the useState
  initializer being called repeatedly, confirming the component was being fully
  remounted rather than re-rendered.

  Fix:

  - Removed `use()` from RscSlot — replaced with effect-based promise resolution
    to `useState<RscPayload | null>`
  - Removed `React.lazy` wrapper from RouteRenderer — RscSlot is imported eagerly
  - Removed Suspense wrapper from the RSC branch — component handles its own
    loading state (null → element)
  - Resolve flight data BEFORE hydration in mount.tsx bootstrap, passing
    the resolved payload (not a promise) as `initialPayload`
  - SSR entry passes `rscPayload` directly as `initialPayload` (not wrapped in
    `Promise.resolve()`)
  - `__rscSetPayloadPromise` renamed to `__rscSetPayload` since the setter now
    receives the resolved payload, not a promise

## 1.0.1

### Patch Changes

- fix: inject window.routes in RSC SSR HTML so client can build route table

  When ssr-entry.tsx renders the RouteProvider shell for RSC pages, it must
  also inject the window.routes inline script. Without it, hydrateRoutes()
  returns an empty array, matchRoute returns null for every URL, and the
  data-loading effect crashes on null.route.getData — causing blank pages
  until manual refresh.

## 1.0.0

### Major Changes

- feat: unified RSC hydration — single shell, smooth SPA navigation for all routes

  **BREAKING**: This rewrites the client hydration architecture. The two separate
  hydration paths (hydrateRsc for RSC pages, hydrateRoot for non-RSC) are replaced
  with a single unified RouteProvider shell that handles all page types.

  ## What changed

  - **Unified bootstrap** — `mount.tsx` always calls `hydrateRoot(RouteProvider)`.
    The `__FLIGHT_DATA` bifurcation and `hydrateRsc()` function are removed.

  - **SSR wraps in RouteProvider** — `ssr-entry.tsx` wraps the RSC element in
    `RouteProvider + RouteRenderer` so the server-rendered DOM tree matches the
    client hydration tree exactly.

  - **RscSlot replaces RscRoot + RscContent** — A single component reads the
    initial RSC element from the decoded `__FLIGHT_DATA` (passed as a prop via
    `use()` + Suspense) and fetches fresh `_.rsc` flight data on navigation.

  - **No more RSC-skip guards** — The click handler, `navigate()`, popstate
    handler, and data-loading effect in `core.tsx` no longer check `match.rsc`.
    All routes navigate via SPA, including RSC-to-RSC and cross-type transitions.

  - **Link component** — New `<Link>` with hover prefetch and TTL cache
    (`prefetch-cache.ts`). Prefetched RSC payloads are decoded and cached,
    making hover-to-click navigation instant.

  - **startTransition on all navigations** — URL updates and content swaps use
    `startTransition`, keeping the current page visible until the new content
    is ready.

  ## Migration notes

  - Consumers using `$app/rsc-content.js` directly can continue to do so; the
    `useServerAction` hook export is preserved.
  - The `Link` component is optional — plain `<a>` tags still work (they trigger
    SPA navigation through the unified click handler).
  - If custom code checks `window.__FLIGHT_DATA` or calls `hydrateRsc()`:
    these are removed. There is one hydration path.

## 0.1.4

### Patch Changes

- fix: prevent RSC server-only modules from crashing client bundle

  Three coordinated changes:

  - Added `rsc` flag to `Routes.toJSON()` so the client knows which
    routes are RSC and must not load their page module client-side
  - RouteRenderer renders `RscContent` (flight payload fetcher) for RSC
    routes instead of lazy-loading the page component which may import
    server-only modules like `@cyb3rcore/reactify/server` (node:async_hooks)
  - Excluded the reactify package from client dep optimization so the
    try/catch guard around `new AsyncLocalStorage()` in rsc-context.ts
    survives the bundler transform as defense-in-depth

- fix: register SPA link click handler before paint with useLayoutEffect

  The delegated click handler in RouteProvider was registered via useEffect,
  which fires after the browser paints. This created a race window where
  the first user click after page load bypassed the handler and triggered
  a full page reload. Changed to useLayoutEffect so the handler is
  registered synchronously before the first paint.

## 0.1.3

### Patch Changes

- fix: resolve \0-prefixed virtual module IDs during SSR build and eliminate hydration async gap

  - `resolveId` now strips the `\0` prefix before the `$app/` regex check, fixing production builds where the RSC plugin emits `\0$app/ssr-entry.js` chunks via `this.emitFile()`.
  - `hydrateRoutes` is no longer `async` (it was internally synchronous), removing the Promise wrapper that created an async gap before hydration — clicks during that gap caused full page reloads.
  - `bootstrap()` is now synchronous, so the click handler registers before the browser paints.

## 0.1.2

### Patch Changes

- 5f0c4d8: fix: skip .d.ts files in virtual module scanner

  Prevents false-positive warnings about unregistered virtual modules for `.d.ts` files found alongside source files in the virtual directory.

- 5f0c4d8: fix(mount): self-invoke bootstrap and fix RSC fallback template URL

  - `mount.tsx` now self-invokes via `bootstrap()` that detects `__FLIGHT_DATA` (RSC hydration) or resolves routes via `hydrateRoutes` (non-RSC hydration). Previously `mount()` was only exported without being called, so React hydration never ran.
  - `ssr-entry.tsx` fallback template uses `src="/$app/mount.js"` (leading slash) so the script resolves correctly from any page path.

- 5f0c4d8: fix: inject hydration data into HTML and fix client-side SPA navigation

  Two issues prevented client-side navigation from working:

  1. **Missing hydration data**: `context.hydration` (`window.route`, `window.routes`) was never emitted into the HTML stream because the template had no `{{hydration}}` placeholder. The hydration script is now injected directly into the shell stream before the closing template, so it's present regardless of `index.html` content.

  2. **Boolean layout override**: `Routes.toJSON()` serialized `layout` as `!!layout` (boolean). When spread into the client route entry, this overrode the actual layout component with `false`, causing `Element type is invalid: got boolean` in `RouteRenderer`. Fixed by stripping `layout` from the serialized metadata spread and adding a guard in `RouteRenderer` against boolean layout.

- 5f0c4d8: fix(virtual): normalize importerDir URL in resolveId to prevent duplicate virtual module instances

  Non-RSC SSR pages were failing with `useRouteContext must be used within a RouteProvider` because the same virtual module (`core.tsx`) was loaded as 4 separate module instances — the `resolveId` handler for relative imports from virtual modules constructed the base URL as `http://localhost$app/` (missing `/` before `$app`), making `./core.js` resolve to `/core.js` instead of `/$app/core.js`. This bypassed the virtual module check and fell through to physical file resolution, creating duplicate instances with different `createContext()` calls. Fixed by prefixing `importerDir` with `/` so the URL is constructed correctly.

- 5f0c4d8: fix(virtual): prefix virtual module IDs with \0 to satisfy Vite's isVirtualModule check

  Returns `\0/{virtual}` instead of `//{virtual}` from `resolveId`. Without the `\0` null byte prefix, route IDs containing `/` failed Vite's `isVirtualModule` check, causing `import.meta.glob` to produce importer-relative paths instead of root-absolute ones. Also handles `\0`-prefixed importers in the relative-import-from-virtual-module resolver, stripping the null byte before URL construction.
