---
"@cyb3rcore/reactify": patch
---

fix(virtual): normalize importerDir URL in resolveId to prevent duplicate virtual module instances

Non-RSC SSR pages were failing with `useRouteContext must be used within a RouteProvider` because the same virtual module (`core.tsx`) was loaded as 4 separate module instances — the `resolveId` handler for relative imports from virtual modules constructed the base URL as `http://localhost$app/` (missing `/` before `$app`), making `./core.js` resolve to `/core.js` instead of `/$app/core.js`. This bypassed the virtual module check and fell through to physical file resolution, creating duplicate instances with different `createContext()` calls. Fixed by prefixing `importerDir` with `/` so the URL is constructed correctly.
