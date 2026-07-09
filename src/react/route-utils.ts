/**
 * Convert a file path from the routes manifest to a route path string.
 *
 * Examples:
 *   /pages/index.jsx        -> /
 *   /pages/about.jsx        -> /about
 *   /pages/blog/[slug].jsx  -> /blog/:slug
 *   /pages/[...catchAll].jsx -> /:catchAll*
 */
export function filePathToRoutePath(filePath: string): string {
  let route = filePath.replace(/\.(jsx|tsx|js|ts)$/, '')
  // Strip pages/ or src/pages/ prefix (with or without leading /)
  route = route.replace(/^\/?(pages|src\/pages)\/?/, '/')
  // Handle index routes
  if (route === '' || route === '/index' || route === 'index') return '/'
  route = route.replace(/\/index$/, '')
  // Catch-all [...name] -> :name*
  route = route.replace(/\[\.\.\.(\w+)\]/g, ':$1*')
  // Dynamic params [name] -> :name
  route = route.replace(/\[(\w+)\]/g, ':$1')
  // Ensure leading /
  if (!route.startsWith('/')) route = '/' + route
  return route
}
