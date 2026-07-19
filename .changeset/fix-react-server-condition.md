---
'@cyb3rcore/reactify': patch
---

**rsc:** remove `react-server` export condition, add `'use client'` to package entry (`814d6821`)

The `react-server` export condition pointed to `dist/react-server.js` which only exported `redirect` and `isRedirectError`. When the RSC environment resolved `@cyb3rcore/reactify`, it got this entry — `Link`, `RouteProvider`, etc. were missing, resolving to `undefined`. Removed the condition; the RSC environment now uses the main entry (`dist/index.js`) which has `'use client'`, so all exports are properly wrapped as client references.
