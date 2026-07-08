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
  // Handle [...name] and [name] BEFORE escaping, since []. would be escaped
  let processed = path
    .replace(RE_CATCH_ALL, (_, name) => {
      paramNames.push(name)
      return '__CATCH_ALL__'
    })
    .replace(RE_PARAM, (_, name) => {
      paramNames.push(name)
      return '__PARAM__'
    })
  // Now escape regex special chars
  processed = processed
    .replace(/[.+?^${}()|\\]/g, '\\$&')
    .replace(/\//g, '\\/')
  processed = processed.replace(/\\\*/g, '(.+)')
  // Replace placeholders with actual regex patterns
  processed = processed.replace(/__CATCH_ALL__/g, '(.+)')
  processed = processed.replace(/__PARAM__/g, '([^/]+)')
  // :param{.+} or :param+ (Fastify catch-all)
  processed = processed.replace(/:([A-Za-z_$][\w$]*)\\\{\\\\.\+\?\\\}/g, (_, name) => {
    paramNames.push(name)
    return '(.+)'
  })
  processed = processed.replace(/:([A-Za-z_$][\w$]*)\\+/g, (_, name) => {
    paramNames.push(name)
    return '(.+)'
  })
  // :param (Fastify native)
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
  routes: T[], pathname: string
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
