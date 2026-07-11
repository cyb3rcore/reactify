/**
 * File-system based URL pattern matching for Reactify.
 *
 * Supports multiple placeholder syntaxes:
 *   - `[param]`         — named parameter matching a single path segment
 *   - `[...catchAll]`   — named catch-all matching one or more segments
 *   - `:param`          — Fastify-style native parameter (single segment)
 *   - `:param+`         — Fastify-style catch-all (one or more segments)
 *
 * Placeholders ending with `+` or `{.+}` are treated as catch-all; all others
 * match a single non-slash segment.
 */
export interface ParsedLocation {
  pathname: string
  search: string
  hash: string
}

export function createPath(loc: { pathname?: string; search?: string; hash?: string }): string {
  let path = loc.pathname ?? ''
  if (loc.search && !loc.search.startsWith('?')) path += '?' + loc.search
  else if (loc.search) path += loc.search
  if (loc.hash && !loc.hash.startsWith('#')) path += '#' + loc.hash
  else if (loc.hash) path += loc.hash
  return path
}

export function parseLocation(input: string | Location): ParsedLocation {
  if (typeof input === 'string') {
    const url = new URL(input, 'http://localhost')
    return { pathname: url.pathname, search: url.search, hash: url.hash }
  }
  return { pathname: input.pathname, search: input.search, hash: input.hash }
}

const RE_PARAM = /\[([A-Za-z_$][\w$]*)\]/g
const RE_CATCH_ALL = /\[\.{3}([A-Za-z_$][\w$]*)\]/g

function patternToRegex(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  /*
   * Multi-pass strategy — order matters:
   *
   * 1. Replace bracketed placeholders (`[...catchAll]`, `[param]`) with
   *    sentinel tokens FIRST, so the `[` and `]` characters don't get
   *    escaped in step 2.
   *
   * 2. Escape regex-special characters (`.`, `+`, `?`, `^`, `$`, ...) that
   *    are part of the literal URL pattern.
   *
   * 3. Replace sentinel tokens with their actual regex capture groups.
   *
   * 4. Handle Fastify-style `:param` / `:param+` placeholders last — these
   *    use `:` which is not a regex metacharacter and doesn't need escaping.
   */
  let processed = path
    .replace(RE_CATCH_ALL, (_, name) => {
      // [...name] — catches everything (one or more path segments)
      paramNames.push(name)
      return '__CATCH_ALL__'
    })
    .replace(RE_PARAM, (_, name) => {
      // [name] — matches a single path segment ([^/]+)
      paramNames.push(name)
      return '__PARAM__'
    })
  // Now escape regex special chars
  processed = processed.replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\//g, '\\/')
  processed = processed.replace(/\\\*/g, '(.+)')
  // Replace sentinel tokens with real capture groups (safe because regex
  // chars are already escaped, so no false matches on literal [ / ])
  processed = processed.replace(/__CATCH_ALL__/g, '(.+)')
  processed = processed.replace(/__PARAM__/g, '([^/]+)')

  // Fastify-style catch-all: `:param{.+}` (escaped by step 2)
  processed = processed.replace(/:([A-Za-z_$][\w$]*)\\\{\\\\.\+\?\\\}/g, (_, name) => {
    paramNames.push(name)
    return '(.+)'
  })
  // Fastify-style catch-all shorthand: `:param+`
  processed = processed.replace(/:([A-Za-z_$][\w$]*)\\+/g, (_, name) => {
    paramNames.push(name)
    return '(.+)'
  })
  // Fastify-style single-segment: `:param`
  processed = processed.replace(/:([A-Za-z_$][\w$]*)/g, (_, name) => {
    paramNames.push(name)
    return '([^/]+)'
  })
  return { regex: new RegExp(`^${processed}$`), paramNames }
}

export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const { regex, paramNames } = patternToRegex(pattern)
  const match = pathname.match(regex)
  if (!match) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < paramNames.length; i++) {
    try {
      params[paramNames[i]] = decodeURIComponent(match[i + 1])
    } catch {
      params[paramNames[i]] = match[i + 1]
    }
  }
  return params
}

export function matchRoute<T extends { path: string }>(
  routes: T[],
  pathname: string,
): { route: T; params: Record<string, string> } | null {
  const sorted = [...routes].sort((a, b) => {
    const aDynamic = a.path.includes('[') || a.path.includes(':')
    const bDynamic = b.path.includes('[') || b.path.includes(':')
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1
    return b.path.length - a.path.length
  })
  for (const route of sorted) {
    const params = matchPath(route.path, pathname)
    if (params) return { route, params }
  }
  return null
}
