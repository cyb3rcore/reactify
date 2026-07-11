---
"@cyb3rcore/reactify": patch
---

fix: inject hydration data into HTML and fix client-side SPA navigation

Two issues prevented client-side navigation from working:

1. **Missing hydration data**: `context.hydration` (`window.route`, `window.routes`) was never emitted into the HTML stream because the template had no `{{hydration}}` placeholder. The hydration script is now injected directly into the shell stream before the closing template, so it's present regardless of `index.html` content.

2. **Boolean layout override**: `Routes.toJSON()` serialized `layout` as `!!layout` (boolean). When spread into the client route entry, this overrode the actual layout component with `false`, causing `Element type is invalid: got boolean` in `RouteRenderer`. Fixed by stripping `layout` from the serialized metadata spread and adding a guard in `RouteRenderer` against boolean layout.
