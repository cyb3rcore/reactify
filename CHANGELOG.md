# @cyb3rcore/reactify

## 1.2.2

- **rsc:** remove `react-server` export condition, add `'use client'` to package entry (`0ce5bda`)

  The `react-server` export condition pointed to `dist/react-server.js` which only exported `redirect` and `isRedirectError`. When the RSC environment resolved `@cyb3rcore/reactify`, it got this entry — `Link`, `RouteProvider`, etc. were missing, resolving to `undefined`. Removed the condition; the RSC environment now uses the main entry (`dist/index.js`) which has `'use client'`, so all exports are properly wrapped as client references.

## 1.2.1

- **fix:** prevent reactify package pre-bundling when installed via `file:` protocol (`21f8259`)

  When reactify is installed via pnpm `file:` protocol, `vitefu`'s `crawlFrameworkPkgs` does not detect it. The package was pre-bundled by the RSC optimizer, preventing `rsc:use-client` from wrapping `'use client'` exports. Explicitly excluded from the optimizer.

## 1.2.0

- **feat:** responsive `Image` component with srcset generation (`d8eeaab`)

  Framework-level `Image` component with responsive srcset/sizes attributes, custom loader, preload support, fill mode, and lazy/eager loading.

- **chore:** version bump for release workflow

## 1.1.0

- **feat:** throw-based `redirect()` utility for `onEnter` lifecycle hooks (`2dd69f4`)

  Produces HTTP 3xx responses from `onEnter` hooks without rendering page content. Caught at three boundaries: SSR (Fastify preHandler), RSC (extractOnEnter), and server actions. Includes `isRedirectError()` type guard.

## 1.0.11

- **fix:** deduplicate virtual module IDs by stripping file extensions (`6bc9ab1`)

  `normalizeVirtualModuleId` left `.js` extensions intact. Different import paths to the same virtual module (`$app/core` vs `./core.js`) created separate module instances with different `createContext()` calls, causing `useRouteContext must be used within a RouteProvider` on SSR pages.

- **feat:** RSC escape hatch for `useParams` via global symbol bridge (`c237642`)

  RSC server components render without RouteProvider, so `useParams()` can't read from React context. Reads from `globalThis` symbol populated by `rsc-entry.tsx`.

- **refactor:** type route and rendering API with `ClientModule` (`6cd1823`)

## 1.0.10

- **fix:** use `package.json` `browser` export condition instead of plugin intercept (`29cb885`)

  Replaced plugin-level load-hook intercept with Vite 8's native `browser` export condition. Vite 8 includes `"browser"` in `defaultClientConditions`, so resolving `@cyb3rcore/reactify` for the browser naturally uses `dist/client-index.js`.

## 1.0.9

- **fix:** strip Vite version hash in load-hook path check (`5059a8a`)

  Vite appends `?v=` cache-busting hashes to module URLs from registries, causing path-suffix checks (`endsWith('/dist/index.js')`) to miss.

## 1.0.8

- **fix:** intercept ESM re-export chain to prevent `node:fs` crash in client browser

  `dist/index.js` re-exports through `vite/config/paths.js` which imports `node:fs`. When a client component imports from `@cyb3rcore/reactify`, Vite follows the chain and crashes. Added resolveId intercept returning a browser-safe stub.

- **fix:** SSR-safe `Link` component, HMR preamble injection

  `Link` wraps `useNavigate()` in try/catch for SSR (falls back to `window.location.href`). SSR entry injects Vite React Refresh preamble. Exports `RouteProvider` and `RouteRenderer` from package entry.

## 1.0.7

- **feat:** RSC route params — pass params as props to server component pages

  RSC pages (`export const rsc = true`) can receive route params via React props instead of `useParams()` which crashes in RSC (hooks unavailable). Added `getParams()` export and passes `matchResult.params` to `createElement()`.

## 1.0.6

- **fix:** replace Youch with safe inline error pages, hide stack traces in production

  Removed static Youch import from routing.ts, replaced with inline error page (dev shows stack, production returns generic 500). Same for rsc-entry.tsx error handler.

## 1.0.5

- **fix:** guard against `rsc: true` + `getData()` conflict

  `getRouteModuleExports` throws when a module exports both `rsc: true` and `getData()` — they are mutually exclusive since RSC routes use server components for data fetching.

## 1.0.4

- **feat:** export `Link` component from package entry

  `<Link>` with hover prefetch is importable from `import { Link } from '@cyb3rcore/reactify'`.

## 1.0.3

- **fix:** resolve runtime errors from linked package development setup

  Four coordinated fixes for linked package development: SSR React resolution via `createRequire`, virtual module resolution for browser-only imports, transitive dependency aliases for rsc-html-stream and devalue, React deduplication across Vite environments. `react` and `react-dom` moved from dependencies to peerDependencies.

## 1.0.2

- **fix:** infinite remount loop in RscSlot caused by `use()` + `React.lazy` + Suspense

  `RscSlot` used `use(payloadPromise)` inside `React.lazy` nested in Suspense. When `use()` suspends, React unmounts and remounts the lazy component on each retry, re-running useState initializer and creating an infinite fetch loop. Replaced with effect-based promise resolution to `useState`.

## 1.0.1

- **fix:** inject `window.routes` in RSC SSR HTML so client can build route table

  SSR entry must inject `window.routes` inline script. Without it, `hydrateRoutes()` returns empty array, `matchRoute` returns null for every URL, causing blank pages until manual refresh.

## 1.0.0

- **feat:** unified RSC hydration — single shell, smooth SPA navigation for all routes

  Complete rewrite of client hydration architecture. Two separate hydration paths (`hydrateRsc`, `hydrateRoot`) replaced with a single `RouteProvider` shell. Bootstrap unified, SSR wraps in RouteProvider, RscSlot replaces RscRoot + RscContent. Link component with hover prefetch and TTL cache. `startTransition` on all navigations.

## 0.1.4

- **fix:** prevent RSC server-only modules from crashing client bundle

  Added `rsc` flag to `Routes.toJSON()`. RouteRenderer renders `RscContent` for RSC routes instead of lazy-loading the page module. Excluded reactify from client dep optimization.

- **fix:** register SPA link click handler before paint with `useLayoutEffect`

  `useEffect` created a race window where the first user click after page load bypassed the handler and triggered full page reload.

## 0.1.3

- **fix:** resolve `\0`-prefixed virtual module IDs during SSR build and eliminate hydration async gap

  Strips `\0` prefix before `$app/` regex check in production builds. `hydrateRoutes` no longer async (removes Promise wrapper that created hydration gap). `bootstrap()` synchronous.

## 0.1.2

- **fix:** skip `.d.ts` files in virtual module scanner (`5f0c4d8`)

  Prevents false-positive warnings about unregistered virtual modules.

- **fix:** self-invoke bootstrap and fix RSC fallback template URL (`5f0c4d8`)

  `mount.tsx` self-invokes bootstrap. Fallback template uses leading slash so script resolves from any page path.

- **fix:** inject hydration data into HTML and fix client-side SPA navigation

  Missing `{{hydration}}` placeholder prevented `window.route`/`window.routes` from being emitted into HTML. Boolean layout override from `Routes.toJSON()` caused `Element type is invalid: got boolean`.

- **fix:** normalize importerDir URL in resolveId to prevent duplicate virtual module instances (`5f0c4d8`)

  Missing `/` before `$app` in base URL caused `./core.js` to resolve to `/core.js` instead of `/$app/core.js`, creating duplicate module instances with different `createContext()` calls.

- **fix:** prefix virtual module IDs with `\0` to satisfy Vite's `isVirtualModule` check (`5f0c4d8`)

  Returns `\0/{virtual}` instead of `//{virtual}` from `resolveId` so route IDs pass Vite's `isVirtualModule` check.
