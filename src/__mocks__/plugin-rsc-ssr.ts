// Mock for @vitejs/plugin-rsc/ssr — Vite RSC SSR plugin
// This module is only available at runtime when the Vite RSC plugin is active.
// In tests, we provide a no-op stub.

export async function createFromReadableStream<T>(_stream: ReadableStream<Uint8Array>): Promise<T> {
  return { matches: [], head: null } as unknown as T
}
