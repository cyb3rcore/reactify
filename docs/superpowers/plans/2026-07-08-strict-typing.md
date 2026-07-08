# Strict Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all 15 `@ts-nocheck` directives, fix 25 pre-existing tsc errors, and enable `strict: true` — with zero `any` casts unless TypeScript literally cannot express the type.

**Architecture:** 8 sequential tasks in 3 phases. Phase 1 fixes module resolution and pre-existing errors. Phase 2 removes `@ts-nocheck` per file in dependency order (leaf → mid → top). Phase 3 enables strict mode.

**Tech Stack:** TypeScript 5+, ESNext modules, Bundler moduleResolution, Vite plugin + Fastify server library.

## Global Constraints

- Zero `any` casts unless TypeScript has no way to express the type; each `any` gets `// TODO: refine type` comment
- `npx tsc --noEmit` must report zero errors after each task
- `npx vitest run` must pass 56/56 after each task
- All relative imports are extensionless (moduleResolution: Bundler handles resolution)
- `.js` extensions in output handled by `rewriteRelativeImportExtensions: true`

---

### Task 1: Switch tsconfig to ESNext/Bundler + create plugin-rsc.d.ts

**Files:**
- Modify: `tsconfig.json:2-24`
- Create: `src/types/plugin-rsc.d.ts`
- Check: `src/types/` directory exists

**Interfaces:**
- Consumes: nothing
- Produces: tsconfig with correct resolution, ambient declarations for `@vitejs/plugin-rsc/*`

- [ ] **Step 1: Switch tsconfig module/moduleResolution to Bundler**

Change `tsconfig.json` lines 11-12 from:
```json
"module": "NodeNext",
"moduleResolution": "NodeNext",
```
to:
```json
"module": "ESNext",
"moduleResolution": "Bundler",
```

Keep `"rewriteRelativeImportExtensions": true` (line 19) — this ensures `.js` extensions in `dist/` output for Node.js consumers.

- [ ] **Step 2: Create `src/types/` directory (if it doesn't exist)**

```bash
mkdir -p src/types
```

- [ ] **Step 3: Create plugin-rsc.d.ts type declarations**

`src/types/plugin-rsc.d.ts`:
```ts
/**
 * Ambient type declarations for @vitejs/plugin-rsc.
 * This package is a peer dependency provided by the consuming project.
 */

declare module '@vitejs/plugin-rsc/rsc' {
  import type { ReactNode } from 'react'

  // RSC rendering core
  export function renderToReadableStream(
    payload: unknown,
    options?: { temporaryReferences?: unknown },
  ): ReadableStream<Uint8Array>

  // Server action helpers
  export function createTemporaryReferenceSet(): unknown
  export function decodeReply(
    body: string | FormData,
    options?: { temporaryReferences?: unknown },
  ): Promise<unknown[]>
  export function loadServerAction(actionId: string): (...args: unknown[]) => Promise<unknown>
  export function decodeAction(
    formData: FormData,
  ): Promise<() => Promise<unknown>>
  export function decodeFormState(
    actionResult: unknown,
    formData: FormData,
  ): Promise<unknown>
}

declare module '@vitejs/plugin-rsc/ssr' {
  export function renderRscToHtml(
    rscStream: ReadableStream<Uint8Array>,
  ): AsyncGenerator<string>
}

declare module '@vitejs/plugin-rsc/browser' {
  import type { ReactNode } from 'react'

  export function createFromReadableStream(
    stream: ReadableStream<Uint8Array>,
    options?: { temporaryReferences?: unknown },
  ): Promise<ReactNode>
}
```

- [ ] **Step 4: Verify tsc + vitest**

Run:
```bash
npx tsc --noEmit
```
Expected: 11 errors (14 TS2835 gone, 3 TS2307 gone, 25-14-3 = 8 remaining)

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json src/types/plugin-rsc.d.ts
git commit -m "chore: switch to ESNext/Bundler module resolution, add plugin-rsc types"
```

---

### Task 2: Fix Phase 1 pre-existing errors in core.tsx, rsc-handler.ts, rsc-entry.tsx

**Files:**
- Modify: `src/react/virtual/core.tsx`
- Modify: `src/react/virtual/rsc-entry.tsx`
- Modify: `src/react/rsc-handler.ts`

**Interfaces:**
- Consumes: Task 1 (tsconfig + type declarations)
- Produces: All 25 pre-existing errors fixed, tsc zero errors

- [ ] **Step 1: Fix core.tsx — href on Element (TS2339 ×3)**

In `src/react/virtual/core.tsx`, the click handler at line 153-171 accesses `link.href` on an `Element | null`. Fix by casting through `HTMLAnchorElement` after null check:

Lines 153-171. Change:
```tsx
const handler = (e: MouseEvent) => {
  const link = (e.target as HTMLElement).closest('a[href]')
  if (!link || !link.href) return
  if (e.metaKey || e.ctrlKey || e.button === 1) return
  if ((link as HTMLAnchorElement).target === '_blank') return
  const url = new URL(link.href)
  if (url.origin !== window.location.origin) return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (link.hasAttribute('download')) return
  e.preventDefault()
  window.history.pushState(null, '', link.href)
  ...
```
To:
```tsx
const handler = (e: MouseEvent) => {
  const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
  if (!link) return
  if (e.metaKey || e.ctrlKey || e.button === 1) return
  if (link.target === '_blank') return
  const url = new URL(link.href)
  if (url.origin !== window.location.origin) return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (link.hasAttribute('download')) return
  e.preventDefault()
  window.history.pushState(null, '', link.href)
  ...
```

The `as HTMLAnchorElement | null` cast is safe because `closest('a[href]')` guarantees the matched element is an anchor element.

- [ ] **Step 2: Fix rsc-handler.ts — IncomingMessage → ReadableStream cast (TS2352)**

Line 16 (`req.raw as ReadableStream`):
The `req.raw` property is `IncomingMessage`, which doesn't overlap with `ReadableStream<any>`. Cast through `unknown`:

```ts
init.body = req.raw as unknown as ReadableStream
```

This is a safe cast — `req.raw` (the Node.js `IncomingMessage`) is a `Readable` stream that Node.js accepts wherever a readable stream is expected.

- [ ] **Step 3: Fix rsc-entry.tsx — RouteConfigEntry lazy type (TS2322)**

The `RouteConfigEntry.lazy` type expects `() => Promise<Record<string, unknown>>` but `routesManifest[importPath]` (a Vite `import.meta.glob` result) returns `() => Promise<unknown>`. Change the interface to match the actual import type:

In `src/react/virtual/rsc-entry.tsx`, change line 42:
```ts
lazy: () => Promise<Record<string, unknown>>
```
to:
```ts
lazy: () => Promise<unknown>
```

The consumption site at line 299 already casts the result with `as Record<string, unknown>`, so this is consistent.

- [ ] **Step 4: Fix rsc-entry.tsx — getMeta not callable (TS2349)**

Lines 152-153: TypeScript can't narrow `Record<string, unknown>.getMeta` from `typeof` check because of the index signature. Extract to a local variable:

```ts
const routeModule_ = routeModule as Record<string, unknown>
const getMeta = routeModule_.getMeta
if (typeof getMeta === 'function') {
  return await getMeta({ url })
}
```

Full function becomes (lines 144-159):
```ts
async function extractHeadMeta(
  routeId: string,
  url: URL,
): Promise<Record<string, unknown> | null> {
  const loader = routesManifest[routeId]
  if (!loader) return null
  try {
    const routeModule = await loader()
    const mod = routeModule as Record<string, unknown>
    const getMeta = mod.getMeta
    if (typeof getMeta === 'function') {
      return await getMeta({ url })
    }
  } catch (err) {
    console.warn('[rsc-entry] getMeta error:', err)
  }
  return null
}
```

- [ ] **Step 5: Fix rsc-entry.tsx — Request → Record cast (TS2352)**

Line 226: `(request as Record<string, unknown>).__valtioState`. Cast through `unknown`:

```ts
const valtioState = (request as unknown as Record<string, unknown>).__valtioState
```

- [ ] **Step 6: Fix rsc-entry.tsx — unknown → object (TS2345)**

Line 362: `snapshot(valtioState)` — `snapshot()` expects `object` but `valtioState` is `unknown`. Add a cast:

```ts
const stateSnapshot =
  getVersion(valtioState) !== undefined
    ? snapshot(valtioState as object)
    : valtioState
```

- [ ] **Step 7: Fix rsc-entry.tsx — Youch import (TS2339)**

Line 408: `const { Youch } = await import('youch')`. Youch exports `Youch` as the **default** export, not a named export:

```ts
const { default: Youch } = await import('youch')
```

Also, instantiate with the correct constructor signature from Youch's types (`Youch<Error, Request>` takes `(error, request)`). Looking at the usage at line 409:
```ts
const youch = new (Youch as any)()
```
With the correct default import, we also need to pass the correct args. The Youch constructor takes `(error, request)`. But in this context, we don't have a request object. Fix both:

```ts
const { default: Youch } = await import('youch')
const youch = new Youch(error, {})
```

Change `const { Youch }` → `const { default: Youch }`, and `new (Youch as any)()` → `new Youch(error, {})`.

- [ ] **Step 8: Verify**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 9: Commit**

```bash
git add src/react/virtual/core.tsx src/react/virtual/rsc-entry.tsx src/react/rsc-handler.ts
git commit -m "fix: resolve 11 pre-existing type errors in core.tsx, rsc-entry.tsx, rsc-handler.ts"
```

---

### Task 3: Remove @ts-nocheck — Leaf tier (context.ts, templating.ts, client.ts, stores.ts, parsers.ts)

**Files:**
- Modify: `src/react/context.ts` (remove nocheck, type `RouteContext` class)
- Modify: `src/react/templating.ts` (remove nocheck, type template helpers)
- Modify: `src/react/client.ts` (remove nocheck, type client context and hydration)
- Modify: `src/react/plugin/stores.ts` (remove nocheck, type code generator)
- Modify: `src/react/plugin/parsers.ts` (remove nocheck, type AST walker)

**Interfaces:**
- Consumes: Task 2 (tsc zero errors baseline)
- Produces: 5 leaf-tier files clean, tsc zero

- [ ] **Step 1: Type `src/react/context.ts` (RouteContext)**

Current: 28 lines, all `any` typed properties. Fix:
```ts
import { createHead, type ActiveHeadEntry } from '@unhead/react/server'
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'

interface RouteContextInit {
  state?: () => Record<string, unknown>
  default?: (ctx: RouteContext) => Promise<void>
  [key: string]: unknown
}

interface RouteDef {
  path: string
  data?: Record<string, unknown> | null
  layout?: string
  getMeta?: boolean
  getData?: boolean
  onEnter?: boolean
  streaming?: boolean
  clientOnly?: boolean
  serverOnly?: boolean
  [key: string]: unknown
}

export default class RouteContext {
  app: unknown = null
  server: FastifyInstance | null = null
  req: FastifyRequest | null = null
  reply: FastifyReply | null = null
  head: Record<string, unknown> = {}
  useHead: ActiveHeadEntry | null = null
  actionData: Record<string, unknown> = {}
  state: Record<string, unknown> | null = null
  data: Record<string, unknown> | null = null
  firstRender: boolean = true
  layout: string | null = null
  getMeta: boolean = false
  getData: boolean = false
  onEnter: boolean = false
  streaming: boolean = false
  clientOnly: boolean = false
  serverOnly: boolean = false
  error: unknown = undefined
  loader: unknown = undefined
  snapshot: unknown = undefined

  static async create(
    server: FastifyInstance,
    req: FastifyRequest,
    reply: FastifyReply,
    route: RouteDef,
    contextInit?: RouteContextInit,
  ): Promise<RouteContext> {
    const routeContext = new RouteContext(server, req, reply, route)
    if (contextInit) {
      if (contextInit.state) {
        routeContext.state = contextInit.state()
      }
      if (contextInit.default) {
        await contextInit.default(routeContext)
      }
    }
    return routeContext
  }

  constructor(
    server: FastifyInstance,
    req: FastifyRequest,
    reply: FastifyReply,
    route: RouteDef,
  ) {
    this.app = null
    this.server = server
    this.req = req
    this.reply = reply
    this.head = {}
    this.useHead = createHead() as unknown as ActiveHeadEntry
    this.actionData = {}
    this.state = null
    this.data = (route.data as Record<string, unknown>) ?? null
    this.firstRender = true
    this.layout = route.layout ?? null
    this.getMeta = !!route.getMeta
    this.getData = !!route.getData
    this.onEnter = !!route.onEnter
    this.streaming = !!route.streaming
    this.clientOnly = !!route.clientOnly
    this.serverOnly = !!route.serverOnly
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return {
      ...this,
      server: { [Symbol.for('nodejs.util.inspect.custom')]: () => '[Server]' },
      req: { [Symbol.for('nodejs.util.inspect.custom')]: () => '[Request]' },
      reply: { [Symbol.for('nodejs.util.inspect.custom')]: () => '[Reply]' },
    }
  }

  toJSON() {
    return {
      actionData: this.actionData,
      state: this.state,
      data: this.data,
      head: this.head,
      layout: this.layout,
      getMeta: this.getMeta,
      getData: this.getData,
      onEnter: this.onEnter,
      firstRender: this.firstRender,
      clientOnly: this.clientOnly,
    }
  }

  static extend(initial: Record<string, unknown>): void {
    const { default: _, ...extra } = initial
    for (const [prop, value] of Object.entries(extra)) {
      if (prop !== 'data' && prop !== 'state') {
        Object.defineProperty(RouteContext.prototype, prop, value)
      }
    }
  }
}
```

Key typing choices:
- `useHead` typed as `ActiveHeadEntry | null` — imported from `@unhead/react/server`
- `[Symbol.for('nodejs.util.inspect.custom')]` is not a well-known property name in TS, so we use `computed property name` syntax directly
- `RouteContextInit` and `RouteDef` interfaces capture the shape accepted by `create()` and constructor
- `useHead = createHead() as unknown as ActiveHeadEntry` — the cast through `unknown` here is acceptable because `createHead()` returns a different overload in `@unhead/react/server` than the plain `ActiveHeadEntry`. If the type doesn't match, use `// TODO: refine type`.

- [ ] **Step 2: Type `src/react/templating.ts`**

Remove `// @ts-nocheck` on line 1. The file's functions are lightly typed — add interface:

```ts
import { createHtmlTemplateFunction, removeHtmlModuleScripts, type HtmlTemplate } from '../vite/utils.js'

interface HtmlTemplates {
  universal: {
    beforeElement: HtmlTemplate
    afterElement: HtmlTemplate
  }
  serverOnly: {
    beforeElement: HtmlTemplate
    afterElement: HtmlTemplate
  }
}

export function createHtmlTemplates(source: string, config: Record<string, unknown>): HtmlTemplates {
  const el = '<!-- element -->'
  const universal = source.split(el)
  const serverOnlyRaw = removeClientModule(source, config)
  const serverOnly = serverOnlyRaw.split(el)
  return {
    universal: {
      beforeElement: createHtmlTemplateFunction(universal[0]),
      afterElement: createHtmlTemplateFunction(universal[1]),
    },
    serverOnly: {
      beforeElement: createHtmlTemplateFunction(serverOnly[0]),
      afterElement: createHtmlTemplateFunction(serverOnly[1]),
    },
  }
}

function removeClientModule(html: string): string {
  return removeHtmlModuleScripts(html)
}
```

Check `src/vite/utils.ts` to verify `createHtmlTemplateFunction` and `removeHtmlModuleScripts` return types. If `createHtmlTemplateFunction` returns a simple function, define `HtmlTemplate` as type matching its return.

- [ ] **Step 3: Type `src/react/client.ts`**

Remove `// @ts-nocheck`. The file exports RouteContext (client-side), useRouteContext, hydrateRoutes, and memoImport:

```ts
import { createContext, useContext, lazy, type ComponentType } from 'react'
import { useSnapshot } from 'valtio'

export interface RouteDef {
  path: string
  component?: ComponentType<unknown>
  loader?: () => Promise<{ default: ComponentType<unknown> }>
  id?: string
  [key: string]: unknown
}

export interface RouteContextValue {
  state?: Record<string, unknown>
  snapshot?: Record<string, unknown>
  [key: string]: unknown
}

export const RouteContext = createContext<RouteContextValue>({})
export const isServer = typeof window === 'undefined' && typeof process === 'object'

export function useRouteContext(): RouteContextValue {
  const routeContext = useContext(RouteContext)
  if (routeContext.state) {
    routeContext.snapshot = isServer
      ? (routeContext.state ?? {})
      : useSnapshot(routeContext.state ?? {})
  }
  return routeContext
}

export async function hydrateRoutes(
  fromInput: RouteDef[] | Record<string, RouteDef>,
): Promise<RouteDef[]> {
  let from: Record<string, RouteDef>
  if (Array.isArray(fromInput)) {
    from = Object.fromEntries(fromInput.map((route) => [route.path, route]))
  } else {
    from = fromInput
  }
  return (window as unknown as Record<string, unknown>).routes.map(
    (route: Record<string, unknown>) => {
      route.loader = memoImport(from[route.id as string])
      route.component = lazy(() => (route.loader as () => Promise<unknown>)())
      return route as unknown as RouteDef
    },
  )
}

function memoImport<T>(func: () => Promise<T>): () => Promise<T> {
  const kFuncExecuted = Symbol('kFuncExecuted')
  const kFuncValue = Symbol('kFuncValue')
  const cache = func as unknown as Record<symbol, T | boolean>
  cache[kFuncExecuted] = false
  return async () => {
    if (!cache[kFuncExecuted]) {
      cache[kFuncValue] = await func()
      cache[kFuncExecuted] = true
    }
    return cache[kFuncValue] as T
  }
}
```

Key note on `window.routes` and `window.route` — these are injected by the server via `devalue.uneval()` in `rendering.ts`. They live on the global scope without declarations. We cast through `window as unknown as Record<string, unknown>` to access them.

- [ ] **Step 4: Type `src/react/plugin/stores.ts`**

Remove `// @ts-nocheck`. This is a code generator producing a string. The return type is `{ code: string; map: null }`:

```ts
export function generateStores(keys: string[]): { code: string; map: null } {
  let code = `
import { useRouteContext } from '@fastify/react/client'

function storeGetter (proxy: Record<string, unknown>, prop: string) {
  if (!proxy.context) {
    proxy.context = useRouteContext()
  }
  if (prop === 'state') {
    return proxy.context.state[proxy.key as string]
  }
  let method: ((...args: unknown[]) => unknown) | undefined
  if ((method = proxy.context.actions?.[proxy.key as string]?.[prop])) {
    if (!proxy.wrappers[prop]) {
      proxy.wrappers[prop] = (...args: unknown[]) => {
        return method(proxy.context.state, ...args)
      }
    }
    return proxy.wrappers[prop]
  }
}
`
  for (const key of keys) {
    code += `
export const ${key} = new Proxy({
  key: '${key}',
  wrappers: {},
  context: null,
}, {
  get: storeGetter
})
`
  }
  return {
    code,
    map: null,
  }
}
```

Note: The generated code references `@fastify/react/client` which was the upstream package name. This is a code string — it gets consumed by Vite's virtual module system, not compiled by our tsc. No need to change the import path in the generated string.

- [ ] **Step 5: Type `src/react/plugin/parsers.ts`**

Remove `// @ts-nocheck`. Use acorn types for the AST walk:

```ts
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import type { Node } from 'acorn'

export function parseStateKeys(code: string): string[] {
  const ast = acorn.parse(code, { sourceType: 'module', ecmaVersion: 2020 })
  let objectKeys: string[] = []
  walk.simple(ast, {
    ExportNamedDeclaration(node: Node) {
      const decl = (node as acorn.ExportNamedDeclaration).declaration
      if (!decl) return
      if (decl.type === 'FunctionDeclaration') {
        const funcDecl = decl as acorn.FunctionDeclaration
        for (const subNode of funcDecl.body.body) {
          if (subNode.type === 'ReturnStatement' && subNode.argument?.type === 'ObjectExpression') {
            objectKeys = extractObjectKeys(subNode.argument)
          }
        }
      } else if (decl.type === 'VariableDeclaration') {
        const varDecl = decl as acorn.VariableDeclaration
        for (const subNode of varDecl.declarations) {
          if (
            subNode.type === 'VariableDeclarator' &&
            subNode.init?.type === 'ArrowFunctionExpression' &&
            subNode.init.body.type === 'ObjectExpression'
          ) {
            objectKeys = extractObjectKeys(subNode.init.body)
          }
        }
      }
    },
  })
  return objectKeys
}

function extractObjectKeys(node: acorn.ObjectExpression): string[] {
  const keys: string[] = []
  for (const prop of node.properties) {
    if (prop.type === 'Property' && prop.key.type === 'Identifier') {
      keys.push(prop.key.name)
    }
  }
  return keys
}
```

- [ ] **Step 6: Verify**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 7: Commit**

```bash
git add src/react/context.ts src/react/templating.ts src/react/client.ts src/react/plugin/stores.ts src/react/plugin/parsers.ts
git commit -m "fix: remove @ts-nocheck from leaf-tier files (context, templating, client, stores, parsers)"
```

---

### Task 4: Remove @ts-nocheck — Mid tier (rendering.ts, routing.ts, preload.ts)

**Files:**
- Modify: `src/react/rendering.ts` (remove nocheck, type SSR render functions)
- Modify: `src/react/routing.ts` (remove nocheck, type Fastify route registration — 167 lines)
- Modify: `src/react/plugin/preload.ts` (remove nocheck, type Vite closeBundle hook)

**Interfaces:**
- Consumes: Task 3 (leaf tier typed)
- Produces: 3 mid-tier files clean, tsc zero

- [ ] **Step 1: Type `src/react/rendering.ts`**

Remove `// @ts-nocheck`. This file uses Fastify's `this`-based pattern (functions registered as `reply.render()`). Add proper type imports and annotations:

Add at top of file:
```ts
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ReactNode, ComponentType } from 'react'
```

Fix `onShellReady` and `onAllReady` — the `Readable.fromWeb()` call needs a cast through `unknown` because Node.js stream types don't align with Web Streams types:

```ts
export async function onShellReady(app: ReactNode): Promise<Readable | Error> {
  try {
    const stream = await renderToReadableStream(app)
    return Readable.fromWeb(stream as unknown as import('stream/web').ReadableStream)
  } catch (error) {
    return error as Error
  }
}

export async function onAllReady(app: ReactNode): Promise<Readable | Error> {
  try {
    const stream = await renderToReadableStream(app)
    await stream.allReady
    return Readable.fromWeb(stream as unknown as import('stream/web').ReadableStream)
  } catch (error) {
    return error as Error
  }
}
```

Fix `createRenderFunction` — the returned function uses `this` as a Fastify reply context:
```ts
type RouteDef = Record<string, unknown>

export async function createRenderFunction({
  routes,
  create,
}: {
  routes: RouteDef[]
  create: (...args: unknown[]) => ReactNode
}): Promise<(this: FastifyReply) => Promise<{ routes: RouteDef[]; context: unknown; body?: Readable }>> {
  const routeMap = Object.fromEntries(routes.map((r: RouteDef) => [r.path as string, r]))
  return async function (this: FastifyReply): Promise<{ routes: RouteDef[]; context: unknown; body?: Readable }> {
    const req = this.request as unknown as Record<string, unknown>
    if (req.route?.streaming) {
      return createStreamingResponse(req, routes, routeMap, create)
    }
    return createResponse(req, routes, routeMap, create)
  }
}
```

Fix `renderSSR` — already partially typed, add proper route parameter type:
```ts
export async function renderSSR(
  url: string,
  routes: RouteDef[],
  options?: { bootstrapScripts?: string[] },
): Promise<ReadableStream<Uint8Array>> {
  const stream = await renderToReadableStream(
    createElement(RouteProvider, { routes, location: url },
      createElement(RouteRenderer),
    ),
    { bootstrapScripts: options?.bootstrapScripts ?? ['/assets/client.js'] },
  )
  return stream
}
```

For remaining internal functions (`createStreamingResponse`, `createResponse`, `createHtmlFunction`, `streamShell`, `createShellStream`, `sendClientOnlyShell`), add explicit parameter types inferred from their call sites. The key patterns:
- `req` parameter is `Record<string, unknown>` (Fastify request with `route` property)
- `routes` is `RouteDef[]`
- `templates` is the return type of `createHtmlTemplates()`
- `context` is similar to the RouteContext shape

- [ ] **Step 2: Type `src/react/routing.ts`**

Remove `// @ts-nocheck`. This file needs:

1. `import type { FastifyRequest, FastifyReply, RouteOptions } from 'fastify'`
2. `import Youch from 'youch'` — already correct, but TypeScript needs to know the `Youch<Error, Request>` generic defaults
3. Type the `RouteContext.create` usage
4. Type the route handler functions

Key typing for `createRoute`:
```ts
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import type { RouteOptions } from 'fastify'
```

The `handler` at line 107 uses `rscStore.run()` — this is correct since `rsc-context.ts` exported `rscStore`.

For the `createErrorHandler` youch usage (line 28):
```ts
const youch = new Youch(error, req.raw)
```
This matches the Youch type `new Youch(error, request)`.

- [ ] **Step 3: Type `src/react/plugin/preload.ts`**

Remove `// @ts-nocheck`. This is a Vite plugin hook (`closeBundle`). Key types:

```ts
import type { ResolvedConfig } from 'vite'

interface BundleMeta {
  facadeModuleId?: string
  htmlPath?: string
  imports?: string[]
  viteMetadata?: {
    importedCss?: string[]
  }
  moduleIds?: string[]
  modules?: Record<string, { originalLength?: number }>
  [key: string]: unknown
}
```

The `this` in `closeBundle` and `loadSource` refers to the Vite plugin context. Type it as `this: { environment: { name: string; config: ResolvedConfig } }`.

- [ ] **Step 4: Verify**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 5: Commit**

```bash
git add src/react/rendering.ts src/react/routing.ts src/react/plugin/preload.ts
git commit -m "fix: remove @ts-nocheck from mid-tier files (rendering, routing, preload)"
```

---

### Task 5: Remove @ts-nocheck — Mid tier (virtual.ts, resource.ts, layouts.ts)

**Files:**
- Modify: `src/react/plugin/virtual.ts` (remove nocheck, type virtual module loader)
- Modify: `src/react/virtual/resource.ts` (remove nocheck, type resource loading)
- Modify: `src/react/virtual/layouts.ts` (remove nocheck, type layout loader)

**Interfaces:**
- Consumes: Task 4 (routing.ts typed — virtual.ts depends on it for import consistency)
- Produces: 3 mid-tier files clean, tsc zero

- [ ] **Step 1: Type `src/react/plugin/virtual.ts`**

Remove `// @ts-nocheck`. Key typing challenges:

- `virtualModules.includes = function(virtual)` — overriding Array includes on a const array
- `loadVirtualModule` returns `{ code: string; map: null }`
- `resolveId`, `loadSource`, `createPlaceholderExports` all used as Vite plugin hooks

```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { findExports } from 'mlly'

const virtualRoot = resolve(import.meta.dirname, '..', 'virtual')
const virtualModules: string[] = [
  'mount.ts',
  'resource.ts',
  'routes.ts',
  'layouts.ts',
  'create.tsx',
  'root.tsx',
  'layouts/',
  'context.ts',
  'core.tsx',
  'index.ts',
]

export const prefix = /^\/?\$app\//

// Override includes to support prefix matching
virtualModules.includes = function (this: string[], virtual: string): boolean {
  if (!virtual) return false
  for (const entry of this) {
    if (virtual.startsWith(entry)) return true
  }
  return false
} as unknown as typeof Array.prototype.includes

export async function resolveId(
  this: { root: string },
  id: string,
): Promise<string | undefined> {
  if (process.platform === 'win32' && /^\.\.\/[C-Z]:/.test(id)) {
    return id.substring(3)
  }
  if (prefix.test(id)) {
    const [, virtual] = id.split(prefix)
    if (virtual) {
      const override = loadVirtualModuleOverride(this.root, virtual)
      if (override) return override
      return `/$app/${virtual}`
    }
  }
}

export function loadVirtualModule(
  virtualInput: string,
): { code: string; map: null } | undefined {
  const virtual = virtualInput
  if (!virtualModules.includes(virtual)) return
  const codePath = resolve(virtualRoot, virtual)
  return {
    code: readFileSync(codePath, 'utf8'),
    map: null,
  }
}

function loadVirtualModuleOverride(
  viteProjectRoot: string,
  virtualInput: string,
): string | undefined {
  const virtual = virtualInput
  if (!virtualModules.includes(virtual)) return
  const overridePath = resolve(viteProjectRoot, virtual)
  if (existsSync(overridePath)) return overridePath
}

export function loadSource(id: string): string {
  const filePath = id.replace(/\?client$/, '').replace(/\?server$/, '')
  return readFileSync(filePath, 'utf8')
}

export function createPlaceholderExports(source: string): string {
  let pExports = ''
  for (const exp of findExports(source)) {
    switch (exp.type) {
      case 'named':
        for (const name of exp.names) {
          pExports += `export const ${name} = {}\n`
        }
        break
      case 'default':
        pExports += `export default {}\n`
        break
      case 'declaration':
        pExports += `export const ${exp.name} = {}\n`
        break
    }
  }
  return pExports
}
```

The `as unknown as typeof Array.prototype.includes` cast for the overridden `includes` is acceptable — we're overriding a method on a specific array instance, which TypeScript doesn't support natively, but it works at runtime.

- [ ] **Step 2: Type `src/react/virtual/resource.ts`**

Remove `// @ts-nocheck`. This file is mostly pure JS typing:

```ts
const clientFetchMap = new Map<string, LoaderState>()
const clientResourceMap = new Map<string, LoaderState>()

interface LoaderState {
  suspended: boolean
  error: Error | null
  result?: unknown
  data?: Record<string, unknown>
  promise: Promise<unknown>
}
```

For `waitResource` and `waitFetch`, the recursive tail-call pattern needs a type annotation:

```ts
export function waitResource<T>(
  path: string,
  id: string,
  promise?: () => Promise<T>,
  resourceMap: Map<string, LoaderState> = clientResourceMap,
): T {
  // ...
}
```

- [ ] **Step 3: Type `src/react/virtual/layouts.ts`**

Remove `// @ts-nocheck`. The `import.meta.glob` call returns a record of lazy import functions:

```ts
import { lazy, type ComponentType } from 'react'

const DefaultLayout = () => import('$app/layouts/default')

const appLayouts: Record<string, () => Promise<unknown>> =
  import.meta.glob('/layouts/*.{jsx,tsx}')

if (
  !Object.keys(appLayouts).some((path) =>
    path.match(/\/layouts\/default\.(j|t)sx/),
  )
) {
  appLayouts['/layouts/default.tsx'] = DefaultLayout as unknown as () => Promise<unknown>
}

export default Object.fromEntries(
  Object.keys(appLayouts).map((path) => {
    const name = path.slice(9, -4)
    return [name, lazy(appLayouts[path])]
  }),
)
```

- [ ] **Step 4: Verify**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 5: Commit**

```bash
git add src/react/plugin/virtual.ts src/react/virtual/resource.ts src/react/virtual/layouts.ts
git commit -m "fix: remove @ts-nocheck from mid-tier files (virtual, resource, layouts)"
```

---

### Task 6: Remove @ts-nocheck — Top tier (server.ts, plugin/index.ts)

**Files:**
- Modify: `src/react/server.ts` (remove nocheck, type prepareServer + createRoutes)
- Modify: `src/react/plugin/index.ts` (remove nocheck, type Vite plugin entry)

**Interfaces:**
- Consumes: Task 4 + Task 5 (routing, rendering, virtual typed)
- Produces: 2 top-tier files clean, tsc zero

- [ ] **Step 1: Type `src/react/server.ts`**

Remove `// @ts-nocheck`. The `Routes extends Array` pattern:

```ts
import type { FastifyInstance } from 'fastify'

interface RouteExport {
  default?: unknown
  path?: string
  layout?: string
  component?: unknown
  getData?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  getMeta?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  onEnter?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  streaming?: boolean
  clientOnly?: boolean
  serverOnly?: boolean
  configure?: (scope: FastifyInstance) => Promise<void>
  onRequest?: unknown
  preParsing?: unknown
  preValidation?: unknown
  preHandler?: unknown
  preSerialization?: unknown
  onError?: unknown
  onSend?: unknown
  onResponse?: unknown
  onTimeout?: unknown
  onRequestAbort?: unknown
  [key: string]: unknown
}

interface RouteDef {
  id: string
  path: string
  name?: string
  layout?: string | null
  component?: unknown
  getData?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  getMeta?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  onEnter?: boolean | ((ctx: unknown) => Promise<Record<string, unknown>>)
  streaming?: boolean
  clientOnly?: boolean
  serverOnly?: boolean
  configure?: (scope: FastifyInstance) => Promise<void>
  onRequest?: unknown
  preParsing?: unknown
  preValidation?: unknown
  preHandler?: unknown
  preSerialization?: unknown
  onError?: unknown
  onSend?: unknown
  onResponse?: unknown
  onTimeout?: unknown
  onRequestAbort?: unknown
}

class Routes extends Array<RouteDef> {
  toJSON(): Array<Record<string, unknown>> {
    return this.map((route) => ({
      id: route.id,
      path: route.path,
      name: route.name,
      layout: route.layout,
      getData: !!route.getData,
      getMeta: !!route.getMeta,
      onEnter: !!route.onEnter,
    }))
  }
}
```

- [ ] **Step 2: Type `src/react/plugin/index.ts`**

Remove `// @ts-nocheck`. This is the Vite plugin entry — needs Vite's `Plugin` type:

```ts
import type { Plugin, ResolvedConfig } from 'vite'
import viteFastify from '../../vite/plugin.js'
import {
  prefix,
  resolveId,
  loadSource,
  loadVirtualModule,
  createPlaceholderExports,
} from './virtual.js'
import { closeBundle } from './preload.js'

interface PluginContext {
  root: string | null
  resolvedConfig?: ResolvedConfig
  indexHtml?: string
  resolvedBundle?: unknown
}

export default function viteFastifyReactPlugin({
  ts,
}: { ts?: boolean } = {}): Plugin[] {
  const context: PluginContext = { root: null }
  return [
    viteFastify({
      clientModule: ts ? '$app/index.ts' : '$app/index.js',
    }) as Plugin,
    {
      name: 'vite-plugin-react-fastify',
      config,
      configResolved: configResolved.bind(context),
      resolveId: resolveId.bind(context),
      async load(this: PluginContext, id: string): Promise<string | { code: string; map: null } | undefined> {
        if (id.includes('?server') && !this.environment?.config.build?.ssr) {
          const source = loadSource(id)
          return createPlaceholderExports(source)
        }
        if (id.includes('?client') && this.environment?.config.build?.ssr) {
          const source = loadSource(id)
          return createPlaceholderExports(source)
        }
        if (prefix.test(id)) {
          const [, virtual] = id.split(prefix)
          if (virtual) return loadVirtualModule(virtual)
        }
      },
      transformIndexHtml: {
        order: 'post' as const,
        handler: transformIndexHtml.bind(context),
      },
      closeBundle(this: PluginContext): void {
        closeBundle.call(this, context.resolvedBundle)
      },
    } as Plugin,
  ]
}

function transformIndexHtml(
  this: PluginContext,
  _html: string,
  ctx: { bundle?: unknown },
): void {
  if (!ctx.bundle) return
  this.indexHtml = _html
  this.resolvedBundle = ctx.bundle
}

function configResolved(this: PluginContext, config: ResolvedConfig): void {
  this.resolvedConfig = config
  this.root = config.root
}

function config(config: Record<string, unknown>, { command }: { command: string }): void {
  if (command === 'build') {
    if (!config.build) config.build = {}
    if (!(config.build as Record<string, unknown>).rollupOptions)
      (config.build as Record<string, unknown>).rollupOptions = {}
    ;(config.build as Record<string, unknown>).rollupOptions = {
      ...(config.build as Record<string, unknown>).rollupOptions as Record<string, unknown>,
      onwarn,
    }
  }
}

function onwarn(warning: { code?: string; message?: string; exporter?: string }, rollupWarn: (w: { code?: string; message?: string; exporter?: string }) => void): void {
  if (
    !(
      warning.code === 'PLUGIN_WARNING' &&
      warning.message?.includes?.('dynamic import will not move module into another chunk')
    ) &&
    !(warning.code === 'UNUSED_EXTERNAL_IMPORT' && warning.exporter === 'vue')
  ) {
    rollupWarn(warning)
  }
}
```

Key note: The `as Plugin` casts on the array elements are necessary because the Vite plugin interface is complex and the inline object literal doesn't perfectly satisfy every optional property. This is a narrow, acceptable use of `as`.

- [ ] **Step 3: Verify**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 4: Commit**

```bash
git add src/react/server.ts src/react/plugin/index.ts
git commit -m "fix: remove @ts-nocheck from top-tier files (server, plugin/index)"
```

---

### Task 7: Remove @ts-nocheck — Test files (parsers.test.ts, virtual.test.ts)

**Files:**
- Modify: `src/react/plugin/parsers.test.ts` (remove nocheck)
- Modify: `src/react/plugin/virtual.test.ts` (remove nocheck)

**Interfaces:**
- Consumes: Task 5 (virtual.ts typed — virtual.test.ts imports from it)
- Produces: 2 test files clean, tsc zero

- [ ] **Step 1: Type `src/react/plugin/parsers.test.ts`**

Remove `// @ts-nocheck`. Fix imports with `.js` extension removal:

```ts
import { describe, it, expect } from 'vitest'
import { parseStateKeys } from './parsers.js'
```

(No `.js` → remove `.js` since we're on Bundler resolution now)

```ts
import { describe, it, expect } from 'vitest'
import { parseStateKeys } from './parsers'
```

- [ ] **Step 2: Type `src/react/plugin/virtual.test.ts`**

Remove `// @ts-nocheck`. Same import fix:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadVirtualModule, prefix, resolveId } from './virtual'
```

- [ ] **Step 3: Verify**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 4: Commit**

```bash
git add src/react/plugin/parsers.test.ts src/react/plugin/virtual.test.ts
git commit -m "fix: remove @ts-nocheck from test files"
```

---

### Task 8: Enable `strict: true`

**Files:**
- Modify: `tsconfig.json:13`

**Interfaces:**
- Consumes: All previous tasks (all 15 nocheck files cleaned, tsc zero, tests passing)
- Produces: Strict mode enabled, tsc zero, tests 56/56

- [ ] **Step 1: Enable strict mode**

In `tsconfig.json`, change line 13 from:
```json
"strict": false,
```
to:
```json
"strict": true,
```

- [ ] **Step 2: Fix strict-mode errors**

Run:
```bash
npx tsc --noEmit
```

This will likely surface new errors from:
- `strictNullChecks` — previously nullable values now require narrowing
- `noImplicitAny` — parameters without explicit types
- `strictFunctionTypes` — function parameter bivariance disabled

Fix each error with proper type annotations. Common patterns:
- Add explicit parameter types where inferred as `any`
- Add null checks before accessing properties on nullable values
- Use type predicates or explicit type guards where types don't overlap

- [ ] **Step 3: Verify**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors

Run:
```bash
npx vitest run
```
Expected: 56/56 pass

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json
git add -u  # pick up any strict-mode fixes across src/
git commit -m "feat: enable strict: true in tsconfig"
```
