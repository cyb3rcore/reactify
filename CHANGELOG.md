# @cyb3rcore/reactify

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
