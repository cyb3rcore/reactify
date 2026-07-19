# RSC Link Test Failure — Investigation Report

## The Problem

One Playwright e2e test consistently fails:

```
e2e/react-mixed/e2e.test.ts:167 » mixed mode » Link navigation from RSC page works
```

The test navigates to `/rsc-link-demo` (an RSC page), waits for `<h1>RSC Link Demo</h1>`:

```tsx
// e2e/react-mixed/client/pages/rsc-link-demo.tsx
import { Link } from '@cyb3rcore/reactify'
export const rsc = true
export default function RscLinkDemo() {
  return <div><h1>RSC Link Demo</h1><Link to="/">Home</Link></div>
}
```

The RSC server crashes trying to render `Link`:

```
Invalid hook call … TypeError: Cannot read properties of null (reading 'useRef')
    at Link (…/src/react/virtual/link.tsx:23:25)
    at renderFunctionComponent (react-server-dom-webpack-server)
```

`Link` calls `useRef`/`useCallback` but the React hooks dispatcher is null because
the React Server Components server has no hooks context. This is expected — `Link`
uses hooks, which can only run on the client. The RSC bundler should have wrapped
`Link` in `registerClientReference()` (a client-bound proxy) so the server
serializes a module reference instead of executing the function.

This test also fails on the **original unmodified code** (`git stash` confirmed).
It is not a regression from the export restructuring.

---

## Architecture Context

The RSC plugin (`@vitejs/plugin-rsc@0.5.27`) has two mechanisms for creating
client references for package exports:

### 1. `rsc:virtual-client-package` (resolveId, order:pre)

Intercepts bare imports (regex `/^(?![a-zA-Z]:)[\w@](?!.*:\/\/)/`) in the RSC
environment. Calls `this.resolve(source)` and checks if
`resolved.id.includes("/node_modules/")`. If true, adds the resolved path to
an internal `packageSources` map and returns the resolved ID.

When the resolved module is later loaded, the `rsc:use-client` transform finds
it in `packageSources` and creates a virtual proxy
(`\0virtual:vite-rsc/client-package-proxy/`) that re-exports all exports from
the package with `registerClientReference()` wrapping.

### 2. `rsc:use-client` (transform, no filter)

Runs on EVERY module in the RSC environment (`this.environment.name === "rsc"`).
Checks `code.includes("use client")` and `hasDirective(ast, "use client")`.
If both true, transforms all exports to `registerClientReference()` wrappers.

For modules NOT in `packageSources`, if the resolved ID includes
`/node_modules/` and the environment is in dev mode, it creates a
`client-in-server-package-proxy` instead. Otherwise, in dev mode, it
falls through to `normalizeViteImportAnalysisUrl(browserEnv, id)`.

### 3. In dev mode, import resolution goes through `es-module-lexer`

In dev mode, the RSC plugin's `rsc:use-client` transform handler does NOT rely
on Vite's `resolveId` chain for import resolution. Instead, it uses
`es-module-lexer` to statically scan the source for `import` statements.
When it finds `import { Link } from '@cyb3rcore/reactify/client'`, it resolves
the import by calling `this.resolve()` internally and follows the resolved
module through the transform pipeline.

---

## Attempted Fixes (in chronological order)

### Attempt 1: Split exports — bare import resolves to server-safe, client components under `./client`

**What:** Moved client components (Link, Image, RouteProvider, RouteRenderer) out
of the bare `"."` entry for the `react-server` condition. Created a separate
`./client` subpath with all client exports.

**Why:** The RSC bundler would resolve `@cyb3rcore/reactify/client` through the
subpath, while `@cyb3rcore/reactify` (bare import) resolves to a server-safe
minimal entry.

**Outcome:** Still failing. The RSC plugin's `virtual-client-package` handler
doesn't intercept our package because `this.resolve()` returns a path that
doesn't include `/node_modules/` (due to `file:../..` symlink in pnpm).

**Key discovery:** The resolved path for our package in the e2e fixture
(`file:../..` installed via pnpm) goes through the WORKSPACE ROOT, not through
node_modules. The `virtual-client-package` handler checks
`resolved.id.includes("/node_modules/")` which is FALSE. Therefore no
`packageSources` entry is created and no client-package-proxy is set up.

Later confirmed: the resolved path DOES include `/node_modules/` when resolved
from the e2e fixture's node_modules perspective:
```
/home/.../e2e/react-mixed/node_modules/@cyb3rcore/reactify/dist/client/index.js
```
The `virtual-client-package` condition SHOULD match. Earlier diagnostic was
flawed (used `require('fs')` in ESM context causing silent crash).

### Attempt 2: Import Link from `@cyb3rcore/reactify/client` in the RSC page

**What:** Changed `rsc-link-demo.tsx` to import from `@cyb3rcore/reactify/client`.

**Why:** The `./client` subpath is the correct place for client components.
The RSC plugin should resolve this as a bare import and intercept it.

**Outcome:** Still failing with the same error. The RSC plugin's transform
never processes `dist/client/index.js` (confirmed by file-based diagnostic
inside the `rsc:use-client` transform handler — condition never matched).

**Note:** This diagnostic was also likely broken by `require('fs')` in ESM.

### Attempt 3: Add `'use client'` to `src/react-server.ts` (the react-server condition entry)

**What:** Made the react-server entry module carry `'use client'` at the top.

**Why:** If the RSC plugin processes the entry module and finds `'use client'`,
it creates client references for all exports, including Link.

**Outcome:** Still failing. The react-server entry is probably not the module
being loaded when the RSC server encounters the import. The module resolution
goes through `es-module-lexer` -> `this.resolve()` -> a different path.

**Side effect:** This would have broken `redirect` in RSC if it worked, because
redirect would be wrapped as a client reference and couldn't be called server-side.

### Attempt 4: Virtual module intercept in reactify plugin (resolveId + load)

**What:** Modified `src/react/plugin/index.ts` to intercept
`@cyb3rcore/reactify/client` in the RSC environment and return a virtual module
`\0reactify:rsc-client` with `'use client'` at the top, re-exporting from
`/$app/link.js` etc. This bypasses the RSC plugin's resolution entirely.

**Why:** A virtual module guaranteed to be in the RSC environment's module graph.
The `rsc:use-client` transform would process it and find `'use client'`.

**Outcome:** Still failing. The transform never processed the virtual module
either. Possibly because the `\0` null-byte prefix prevented the module from
entering the transform pipeline, or because the `/$app/` paths inside the
virtual module resolved incorrectly.

### Attempt 5: `'use client'` on `src/client/index.ts` (the `./client` subpath entry)

**What:** Added `'use client'` at the top of the `./client` barrel. This is
semantically correct — ALL exports from this barrel are client-side
(Link, Image, RouteProvider, RouteRenderer, RouteContext, useRouteContext,
hydrateRoutes all use hooks or DOM). Reverted the react-server entry back to
just `redirect`/`isRedirectError` (no `'use client'`). Reverted ALL plugin
changes. Kept the page importing from `./client` subpath.

**Why:** The `./client` subpath resolves through `exports["./client"].import`
→ `dist/client/index.js`. The resolved path includes `/node_modules/`
(confirmed via `resolve()`). The `virtual-client-package` handler should set
up `packageSources`. The `rsc:use-client` transform should process the module
and find `'use client'`, creating proper client references.

**Outcome:** Still failing. 32/33 other tests pass.

**Remaining hypothesis:** The `rsc:use-client` transform processes the PAGE
module (`rsc-link-demo.tsx`) and finds the import `@cyb3rcore/reactify/client`.
At that point, it resolves the import via `this.resolve()` and follows the
resolved module through the transform. But the resolved module
(`dist/client/index.js`) might be loaded in the CLIENT environment, not the
RSC environment. The `rsc:use-client` transform's first check is
`this.environment.name === serverEnvironmentName` (where serverEnvName is
`"rsc"`). If the module is loaded in the client environment, the transform
skips it entirely.

This would be consistent with the RSC architecture: the RSC environment
processes SERVER components. When it encounters a CLIENT import, it creates
a reference and lets the client environment handle the actual module.

---

## Diagnostic Methods Tried

1. **`console.log` in resolveId handler** — Not visible because Playwright
   captures stdout from the dev server process differently. Logs from Vite
   plugin hooks may go to a different stream.

2. **`fs.appendFileSync` in plugin handlers** — Worked in our own plugin
   (showed `[reactify:load]` diagnostics for the `rsc` environment).
   Failed in the RSC plugin because `require('fs')` was used instead of
   the `fs` variable already imported at the top of the file.

3. **`require('fs')` in ESM context** — CRASHES silently. The RSC plugin
   is an ESM module, so `require` is not defined. The crash is caught by
   Vite's error handling and the plugin handler fails silently.

4. **Checking resolved paths via Node.js `resolve()`** — Showed that the
   resolved path DOES include `/node_modules/`, contradicting the earlier
   (flawed) diagnostic that showed `inNodeModules: false`.

---

## Key File Paths

| File | Purpose |
|------|---------|
| `src/client/index.ts` | Barrel for `./client` subpath (now has `'use client'`) |
| `src/react-server.ts` | Entry for `react-server` condition (redirect only) |
| `e2e/react-mixed/client/pages/rsc-link-demo.tsx` | Failing test's RSC page |
| `node_modules/@vitejs/plugin-rsc/dist/plugin-BK29Va7z.js` | RSC plugin source |
| `src/react/plugin/index.ts` | Reactify's Vite plugin (clean — no RSC intercept) |
| `dist/react/virtual/link.js` | Compiled Link component (has `'use client'`) |
| `dist/client/index.js` | Compiled client barrel (now has `'use client'`) |

---

## What IS Known for Certain

1. The test **also fails on the original code** (pre-existing, not a regression).
2. The `'use client'` on `dist/client/index.js` IS present in the e2e fixture's
   pnpm store copy.
3. The resolved path for `@cyb3rcore/reactify/client` INCLUDES `/node_modules/`.
4. The `rsc:use-client` transform's diagnostic (using `fs.appendFileSync`)
   NEVER fired for any of our modules — suggesting the transform never sees them
   in the RSC environment.
5. 32/33 other Playwright tests pass (all non-Link RSC tests, SSR tests, etc.).
6. The `react-rsc` e2e fixture NEVER imports from `@cyb3rcore/reactify` directly
   — its tests pass because no client components are used.

---

## Unanswered Questions for the Next Investigator

1. **Does the `rsc:use-client` transform run on modules that are only
   transitively imported (i.e., not directly in a server component)?** The
   transform processes the PAGE module, then for each import found by
   `es-module-lexer`, it calls `this.resolve()` and follows the result.
   Does it also apply the transform to the resolved module?
   
2. **Which environment does `dist/client/index.js` land in when resolved
   from an RSC page import?** Vite 8's multi-environment routing might
   place client subpath modules in the `client` environment, where the
   `rsc:use-client` transform doesn't run.

3. **Would installing the package via `npm link` (not `file:../..`) resolve
   differently?** The pnpm `file:../..` protocol creates a hardlink to the
   workspace `dist/`. A proper `npm link` or `npm pack + install` would place
   the package in a true `node_modules` context.

4. **Does the `rsc:use-client` transform's `es-module-lexer` scan actually
   follow imports to client modules?** The transform might simply CREATE
   module references for ALL imports found by the lexer, without loading
   and transforming the imported module itself.

5. **Is there a way to verify the RSC plugin's `packageSources` map
   contents at runtime?** If `dist/client/index.js` IS in `packageSources`,
   the proxy path should be created. If NOT, the `virtual-client-package`
   handler isn't firing for our subpath.

---

## Current State of the Branch

Committed: the `./client` subpath has `'use client'`, the react-server entry
is slimmed to redirect-only, the e2e page imports from `./client`. The
plugin source is clean (no RSC-specific intercepts). All other tests pass.
