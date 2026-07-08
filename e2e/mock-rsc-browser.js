// Mock for @vitejs/plugin-rsc/browser
// Used in vitest e2e tests to avoid loading the actual plugin-rsc
// which has CJS/Webpack dependencies incompatible with vitest SSR environment.

export async function createFromFetch() {}
export async function createFromReadableStream() {}
export function createServerReference() {
  return () => {}
}
export function createTemporaryReferenceSet() {
  return { reference: () => {} }
}
export async function encodeReply() {
  return new ArrayBuffer(0)
}
export function findSourceMapURL() {
  return undefined
}
export function setServerCallback() {}
export function callServer() {}
export function setRequireModule() {}
