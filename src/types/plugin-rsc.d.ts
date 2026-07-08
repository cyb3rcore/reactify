/**
 * Ambient type declarations for @vitejs/plugin-rsc.
 * This package is a peer dependency provided by the consuming project.
 * Types sourced from https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc
 */

// ---------------------------------------------------------------------------
// Shared option types
// ---------------------------------------------------------------------------

interface CallServerCallback {
  (id: string, args: unknown[]): Promise<unknown>
}

interface EncodeReplyOptions {
  temporaryReferences?: unknown
  signal?: AbortSignal
}

interface DecodeReplyOptions {
  temporaryReferences?: unknown
  arraySizeLimit?: number
}

interface RenderToReadableStreamOptions {
  debugChannel?: { readable?: ReadableStream; writable?: WritableStream }
  environmentName?: string | (() => string)
  filterStackFrame?: (url: string, functionName: string) => boolean
  identifierPrefix?: string
  signal?: AbortSignal
  startTime?: number
  temporaryReferences?: unknown
  onError?: (error: unknown) => void
}

interface CreateFromReadableStreamBrowserOptions {
  callServer?: CallServerCallback
  debugChannel?: { readable?: ReadableStream; writable?: WritableStream }
  endTime?: number
  environmentName?: string
  replayConsoleLogs?: boolean
  startTime?: number
  temporaryReferences?: unknown
}

// ---------------------------------------------------------------------------
// @vitejs/plugin-rsc/browser — client-side RSC runtime
// ---------------------------------------------------------------------------

declare module '@vitejs/plugin-rsc/browser' {
  export { setRequireModule } from '@vitejs/plugin-rsc/browser/internal'

  export function createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: CreateFromReadableStreamBrowserOptions,
  ): Promise<T>

  export function createFromFetch<T>(
    promiseForResponse: Promise<Response>,
    options?: CreateFromReadableStreamBrowserOptions,
  ): Promise<T>

  export const encodeReply: (
    value: unknown[],
    options?: EncodeReplyOptions,
  ) => Promise<string | FormData>

  export const createServerReference: (...args: any[]) => unknown

  export function callServer(...args: any[]): any

  export function setServerCallback(fn: CallServerCallback): void
  export type { CallServerCallback }

  export const createTemporaryReferenceSet: () => unknown

  export function findSourceMapURL(
    filename: string,
    environmentName: string,
  ): string | null
}

// ---------------------------------------------------------------------------
// @vitejs/plugin-rsc/rsc — server-side RSC runtime (RSC environment)
// ---------------------------------------------------------------------------

declare module '@vitejs/plugin-rsc/rsc' {
  import type { ReactFormState } from 'react-dom/client'

  export { loadServerAction, setRequireModule } from '@vitejs/plugin-rsc/rsc/internal'

  export function renderToReadableStream<T>(
    data: T,
    options?: RenderToReadableStreamOptions,
    extraOptions?: {
      onClientReference?: (metadata: { id: string; name: string }) => void
    },
  ): ReadableStream<Uint8Array>

  export function createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: {
      debugChannel?: { readable?: ReadableStream; writable?: WritableStream }
      endTime?: number
      environmentName?: string
      nonce?: string
      replayConsoleLogs?: boolean
      startTime?: number
      temporaryReferences?: unknown
    },
  ): Promise<T>

  export function registerClientReference<T>(
    proxy: T,
    id: string,
    name: string,
  ): T

  export const registerServerReference: <T>(
    ref: T,
    id: string,
    name: string,
  ) => T

  export const decodeReply: (
    body: string | FormData,
    options?: DecodeReplyOptions,
  ) => Promise<unknown[]>

  export function decodeAction(
    body: FormData,
  ): Promise<() => Promise<void>>

  export function decodeFormState(
    actionResult: unknown,
    body: FormData,
  ): Promise<ReactFormState | undefined>

  export const createTemporaryReferenceSet: () => unknown

  export const encodeReply: (
    value: unknown[],
    options?: EncodeReplyOptions,
  ) => Promise<string | FormData>

  export const createClientTemporaryReferenceSet: () => unknown
}

// ---------------------------------------------------------------------------
// @vitejs/plugin-rsc/ssr — SSR environment RSC runtime
// ---------------------------------------------------------------------------

declare module '@vitejs/plugin-rsc/ssr' {
  export { setRequireModule } from '@vitejs/plugin-rsc/ssr/internal'

  export function createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: {
      debugChannel?: { readable?: ReadableStream; writable?: WritableStream }
      endTime?: number
      environmentName?: string
      nonce?: string
      replayConsoleLogs?: boolean
      startTime?: number
      temporaryReferences?: unknown
    },
  ): Promise<T>

  export function createServerReference(id: string): unknown

  export const callServer: null
  export const findSourceMapURL: null
}

// ---------------------------------------------------------------------------
// Internal paths re-exported by the main modules (stubs)
// ---------------------------------------------------------------------------

declare module '@vitejs/plugin-rsc/browser/internal' {
  export function setRequireModule(options: {
    requireModule: (id: string) => unknown
  }): void
}

declare module '@vitejs/plugin-rsc/rsc/internal' {
  export function setRequireModule(options: {
    requireModule: (id: string) => unknown
  }): void

  export function loadServerAction(id: string): Promise<Function>
}

declare module '@vitejs/plugin-rsc/ssr/internal' {
  export function setRequireModule(options: {
    requireModule: (id: string) => unknown
  }): void
}
