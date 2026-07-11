---
"@cyb3rcore/reactify": patch
---

fix: skip .d.ts files in virtual module scanner

Prevents false-positive warnings about unregistered virtual modules for `.d.ts` files found alongside source files in the virtual directory.
