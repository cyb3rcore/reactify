# Package Exports: React-Server Condition

Add a `"react-server"` export condition to `@cyb3rcore/reactify` and restructure
client/server entry points to follow Waku's conditional-exports pattern.

## Motivation

When a Vite RSC bundler resolves `import { Link } from '@cyb3rcore/reactify'`,
it currently follows the default `"import"` condition which re-exports client
components (`Link`, `RouteProvider`, `RouteRenderer`) that use hooks or
`"use client"` directives — these should not be loaded in an RSC server
component context.

A `"react-server"` condition lets the bundler resolve to a server-component-safe
entry instead.

## Design

### Directory layout

```
src/
  client/
    index.ts          ← NEW barrel: ./client subpath
  server/
    index.ts          ← NEW barrel: ./server subpath (moved from src/server.ts)
  react-server.ts     ← NEW entry for "react-server" condition on "."
  index.ts            ← unchanged (bare import default)
  client-index.ts     ← unchanged (browser condition) with forwarding tweak
  client.ts           ← REMOVED (replaced by client/index.ts)
  server.ts           ← REMOVED (replaced by server/index.ts)
  plugin.ts           ← unchanged
```

No tsconfig changes — `rootDir: "src"` covers all new paths.

### New barrels

**`src/client/index.ts`** — all browser-facing exports:
```
- Link              from ../react/virtual/link.js
- Image             from ../react/virtual/image.js
- RouteProvider     from ../react/virtual/core.js
- RouteRenderer     from ../react/virtual/root.js
- RouteContext      from ../react/client.js
- useRouteContext   from ../react/client.js
- hydrateRoutes     from ../react/client.js
```

**`src/server/index.ts`** — server-side utilities (moved from `src/server.ts`):
```
- prepareServer     from ../react/server.js
- createRoutes      from ../react/server.js
- getContext        from ../react/rsc-context.js
- getReq            from ../react/rsc-context.js
- getReply          from ../react/rsc-context.js
- getServer         from ../react/rsc-context.js
- redirect          from ../react/redirect.js
- isRedirectError   from ../react/redirect.js
```

**`src/react-server.ts`** — NEW entry for the `"react-server"` condition on `"."`.
Exports everything from the default entry except the Vite plugin (which uses
Node.js built-in modules). **Must include client components** because the RSC
bundler resolves bare imports through this condition and needs to discover
all exports to create proper client reference boundaries from `'use client'`
directives in leaf modules.
```
- Link              from ./react/virtual/link.js
- Image             from ./react/virtual/image.js
- RouteProvider     from ./react/virtual/core.js
- RouteRenderer     from ./react/virtual/root.js
- redirect          from ./react/redirect.js
- isRedirectError   from ./react/redirect.js
```

Not included: `reactifyVite` (Vite plugin, not an RSC concern).

### Updated existing files

**`src/client-index.ts`** — forwards client component re-exports through
`./client/index.js` instead of duplicating paths:
```
- Link, Image, RouteProvider, RouteRenderer  from ./client/index.js
- redirect, isRedirectError                   from ./react/redirect.js
```

**`src/index.ts`** — unchanged. Still exports everything for the default
Node.js `"import"` condition.

### package.json exports

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "react-server": "./dist/react-server.js",
      "browser": "./dist/client-index.js",
      "import": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "import": "./dist/client/index.js"
    },
    "./server": {
      "types": "./dist/server/index.d.ts",
      "import": "./dist/server/index.js"
    },
    "./plugin": { /* unchanged */ },
    "./utils": { /* unchanged */ },
    "./renderer": { /* unchanged */ }
  }
}
```

### Resolution order

| Scenario                          | Condition matched | Resolves to                |
| --------------------------------- | ----------------- | -------------------------- |
| RSC bundler (Vite RSC env)        | `react-server`      | `dist/react-server.js`     |
| Browser bundle                    | `browser`           | `dist/client-index.js`     |
| Node.js SSR / test runner / etc.  | `import`            | `dist/index.js`            |

### Consumer impact

- **No breaking changes** — all existing subpaths continue to work.
- `./client` and `./server` now resolve to `dist/client/index.js` and
  `dist/server/index.js` (directory barrels) instead of `dist/client.js` and
  `dist/server.js` (flat files). This is transparent to ESM consumers.
- `./client` exports additional names (Link, Image, RouteProvider,
  RouteRenderer, hydrateRoutes) — additive, no existing import breaks.
- RSC bundlers that respect `react-server` now get a clean resolved entry.

## Plugin side-effect

The existing `\0reactify:client-stub` hack in `src/react/plugin/index.ts`
intercepts bare imports in the client environment and returns a stub with
only client components. This is no longer strictly necessary with proper
conditional exports, but it acts as a safety net for older bundler versions
that may not respect `react-server`. Keep it as-is — removing it is a
separate cleanup.

## Files changed

| File                         | Action |
| ---------------------------- | ------ |
| `src/client/index.ts`          | **Create** |
| `src/server/index.ts`          | **Create** |
| `src/react-server.ts`          | **Create** |
| `src/client.ts`                | **Delete** |
| `src/server.ts`                | **Delete** |
| `src/client-index.ts`          | **Edit** (forward re-exports) |
| `package.json`                 | **Edit** (exports map) |
