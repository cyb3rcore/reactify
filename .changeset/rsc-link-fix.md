---
'@cyb3rcore/reactify': patch
---

Fix `'use client'` components (Link, Image) crashing in RSC pages when reactify is installed via `file:` protocol

### Changes

Ensures the reactify package is not pre-bundled by the RSC dependency optimizer, so the `@vitejs/plugin-rsc` plugin can properly register `'use client'` components (Link, Image, etc.) as client references in the RSC environment.

**Commits:**

- [`814d6821`](https://github.com/cyb3rcore/reactify/commit/814d6821) — fix: ensure reactify package is not pre-bundled by RSC optimizer

### Root cause

When reactify is installed via pnpm `file:` protocol, `vitefu`'s `crawlFrameworkPkgs` does not detect it (because it checks for `peerDependencies.react` via filesystem scanning). This means the package is not excluded from the RSC optimizer, which pre-bundles it into a single chunk. The RSC plugin's `rsc:use-client` transform never sees the individual modules, so `'use client'` exports are never wrapped with `registerClientReference()`.

The fix explicitly adds the reactify package name to the RSC environment's `resolve.noExternal` and `optimizeDeps.exclude` in the plugin config hook.
