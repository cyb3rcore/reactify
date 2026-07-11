---
"@cyb3rcore/reactify": patch
---

fix(mount): self-invoke bootstrap and fix RSC fallback template URL

- `mount.tsx` now self-invokes via `bootstrap()` that detects `__FLIGHT_DATA` (RSC hydration) or resolves routes via `hydrateRoutes` (non-RSC hydration). Previously `mount()` was only exported without being called, so React hydration never ran.
- `ssr-entry.tsx` fallback template uses `src="/$app/mount.js"` (leading slash) so the script resolves correctly from any page path.
