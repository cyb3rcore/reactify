---
"@cyb3rcore/reactify": patch
---

fix(virtual): prefix virtual module IDs with \0 to satisfy Vite's isVirtualModule check

Returns `\0/{virtual}` instead of `//{virtual}` from `resolveId`. Without the `\0` null byte prefix, route IDs containing `/` failed Vite's `isVirtualModule` check, causing `import.meta.glob` to produce importer-relative paths instead of root-absolute ones. Also handles `\0`-prefixed importers in the relative-import-from-virtual-module resolver, stripping the null byte before URL construction.
