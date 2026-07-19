'use client'

export { Link, Image, RouteProvider, RouteRenderer } from './client/index.js'
export { redirect, isRedirectError } from './react/redirect.js'

// Browser-compatible default export for the server-only reactifyVite plugin.
// Vite resolves @cyb3rcore/reactify via the 'browser' export condition for client
// bundles, so a default export must exist to prevent SyntaxError on default imports.
// This shim should never be called from browser code — it throws a descriptive error
// if it is.
function reactifyVite(..._args: unknown[]): never {
  throw new Error(
    'reactifyVite is only available on the server (it is a Fastify+Vite plugin). ' +
    'This function should never be called from client code.'
  )
}
export { reactifyVite }
export default reactifyVite
