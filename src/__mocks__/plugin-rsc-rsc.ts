// Mock for @vitejs/plugin-rsc/rsc — Vite RSC server plugin
// This module is only available at runtime when the Vite RSC plugin is active.
// In tests, we provide no-op stubs.

export function renderToReadableStream(payload: unknown, _options?: unknown): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)))
      controller.close()
    },
  })
}

export function createTemporaryReferenceSet(): object {
  return {}
}

export async function decodeReply(
  _body: string | FormData,
  _options?: { temporaryReferences?: unknown },
): Promise<unknown[]> {
  return []
}

export async function loadServerAction(_id: string): Promise<(...args: unknown[]) => unknown> {
  return async () => {}
}

export async function decodeAction(_formData: FormData): Promise<() => Promise<unknown>> {
  return async () => {}
}

export async function decodeFormState(
  _actionResult: unknown,
  _formData: FormData,
): Promise<unknown> {
  return {}
}
