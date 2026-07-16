# React-Server Condition Exports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `"react-server"` export condition to package.json and restructure `src/client.ts` → `src/client/index.ts` and `src/server.ts` → `src/server/index.ts` for consistency.

**Architecture:** Three new files (two folder barrels, one flat entry), two deletions, two edits. No logic changes — only file moves and import path adjustments.

**Tech Stack:** TypeScript (tsc builds), NodeNext module resolution.

## Global Constraints

- All relative import paths must account for barrel depth change (`./foo` → `../foo` when moving `src/X.ts` → `src/X/index.ts`).
- No new runtime dependencies.
- Existing subpath consumers (`@cyb3rcore/reactify/client`, `@cyb3rcore/reactify/server`) must continue working.
- `dist/` is gitignored; verify with `npm run build` and examine `dist/` output.

---

### Task 1: Convert `src/server.ts` → `src/server/index.ts`

**Files:**
- Create: `src/server/index.ts`
- Delete: `src/server.ts`

**Interfaces:**
- Consumes: current `src/server.ts` exports
- Produces: `@cyb3rcore/reactify/server` subpath resolves to `dist/server/index.js`

- [ ] **Step 1: Create `src/server/index.ts`**

Content (identical exports to current `src/server.ts`, adjusted import paths):

```ts
export { prepareServer, createRoutes } from '../react/server.js'
export { getContext, getReq, getReply, getServer } from '../react/rsc-context.js'

export { redirect, isRedirectError } from '../react/redirect.js'
```

- [ ] **Step 2: Remove `src/server.ts`**

```bash
rm src/server.ts
```

- [ ] **Step 3: Build and verify no compilation errors**

```bash
npm run build 2>&1
```

Expected: tsc exits 0, `dist/server/index.js` and `dist/server/index.d.ts` exist.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git add -f src/server.ts  # staged delete
git commit -m "refactor: move server.ts to server/index.ts barrel"
```

---

### Task 2: Convert `src/client.ts` → `src/client/index.ts`

**Files:**
- Create: `src/client/index.ts`
- Delete: `src/client.ts`

**Interfaces:**
- Consumes: current `src/client.ts` exports + additional client modules
- Produces: `@cyb3rcore/reactify/client` subpath resolves to `dist/client/index.js`, now includes Link, Image, RouteProvider, RouteRenderer, hydrateRoutes

- [ ] **Step 1: Create `src/client/index.ts`**

```ts
export { default as Link } from '../react/virtual/link.js'
export { default as Image } from '../react/virtual/image.js'
export { RouteProvider } from '../react/virtual/core.js'
export { RouteRenderer } from '../react/virtual/root.js'
export { RouteContext, useRouteContext, hydrateRoutes } from '../react/client.js'
```

- [ ] **Step 2: Remove `src/client.ts`**

```bash
rm src/client.ts
```

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1
```

Expected: tsc exits 0. `dist/client/index.js` and `dist/client/index.d.ts` exist. Verify `dist/client/index.js` contains all 7 exports.

- [ ] **Step 4: Commit**

```bash
git add src/client/index.ts
git add -f src/client.ts  # staged delete
git commit -m "refactor: move client.ts to client/index.ts barrel, add Link/Image/RouteProvider/RouteRenderer"
```

---

### Task 3: Create `src/react-server.ts`

**Files:**
- Create: `src/react-server.ts`

**Interfaces:**
- Produces: `dist/react-server.js` (resolved by the `"react-server"` condition on `"."`)

- [ ] **Step 1: Create `src/react-server.ts`**

```ts
export { redirect, isRedirectError } from './react/redirect.js'
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1
```

Expected: tsc exits 0. Check `dist/react-server.js` content:

```bash
node -e "const m = require('./dist/react-server.js'); console.log(Object.keys(m))"
```

Expected output: `[ 'isRedirectError', 'redirect' ]`

- [ ] **Step 3: Commit**

```bash
git add src/react-server.ts
git commit -m "feat: add react-server.ts entry for server-component-safe exports"
```

---

### Task 4: Update `src/client-index.ts` to forward through `./client/index.js`

**Files:**
- Modify: `src/client-index.ts`

**Interfaces:**
- Consumes: exports from `src/client/index.ts` (created in Task 2)
- Produces: the `"browser"` condition on `"."` resolves to `dist/client-index.js`

- [ ] **Step 1: Update `src/client-index.ts`**

Replace the current duplicate re-exports with a forward through the client barrel:

```ts
export { Link, Image, RouteProvider, RouteRenderer } from './client/index.js'
export { redirect, isRedirectError } from './react/redirect.js'
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1
```

Expected: tsc exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/client-index.ts
git commit -m "refactor: client-index.ts forwards through client/index.ts barrel"
```

---

### Task 5: Update package.json exports map

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `"exports"` field**

Change:

```json
".": {
  "types": "./dist/index.d.ts",
  "browser": "./dist/client-index.js",
  "import": "./dist/index.js"
},
"./client": {
  "types": "./dist/client.d.ts",
  "import": "./dist/client.js"
},
"./server": {
  "types": "./dist/server.d.ts",
  "import": "./dist/server.js"
}
```

To:

```json
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
}
```

Only three changes: (1) new `"react-server"` condition on `"."`, (2) `./client` path from `./dist/client.js` → `./dist/client/index.js`, (3) `./server` path from `./dist/server.js` → `./dist/server/index.js`.

- [ ] **Step 2: Build + verify dist output**

```bash
npm run build 2>&1
```

Expected: tsc exits 0. Check the expected dist files exist:

```bash
ls dist/react-server.js dist/client/index.js dist/server/index.js dist/index.js dist/client-index.js
```

All should exist.

- [ ] **Step 3: Run unit tests**

```bash
npm test 2>&1
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add react-server export condition, update client/server subpaths"
```

---

### Post-implementation verification

- [ ] **Verify resolution order**

```bash
# Default Node.js import resolves correctly
node -e "import('@cyb3rcore/reactify').then(m => console.log('default:', Object.keys(m)))" --input-type=module

# ./client subpath works
node -e "import('@cyb3rcore/reactify/client').then(m => console.log('client:', Object.keys(m)))" --input-type=module

# ./server subpath works
node -e "import('@cyb3rcore/reactify/server').then(m => console.log('server:', Object.keys(m)))" --input-type=module
```
