// Mock for @vitejs/plugin-rsc/browser — Vite RSC browser plugin
// This module is only available at runtime when the Vite RSC plugin is active.
// In tests, we provide no-op stubs.

export async function createFromFetch(
  _fetchPromise: Promise<Response>,
  _options?: { temporaryReferences?: unknown },
): Promise<Record<string, unknown>> {
  return { matches: [], returnValue: {} }
}

export function setServerCallback(_cb: (id: string, args: unknown[]) => Promise<unknown>): void {
  // no-op
}

export function createTemporaryReferenceSet(): object {
  return {}
}

export async function encodeReply(
  _args: unknown[],
  _options?: { temporaryReferences?: unknown },
): Promise<string> {
  return '{}'
}
