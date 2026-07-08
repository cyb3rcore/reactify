import { describe, it, expect } from 'vitest'
import { matchPath, matchRoute, createPath, parseLocation } from './router'

describe('matchPath', () => {
  it('matches static routes', () => {
    expect(matchPath('/about', '/about')).toEqual({})
  })
  it('matches [param] format', () => {
    expect(matchPath('/users/[id]', '/users/42')).toEqual({ id: '42' })
  })
  it('matches :param format', () => {
    expect(matchPath('/users/:id', '/users/42')).toEqual({ id: '42' })
  })
  it('matches catch-all [...slug]', () => {
    expect(matchPath('/docs/[...slug]', '/docs/a/b/c')).toEqual({ slug: 'a/b/c' })
  })
  it('returns null for non-matching paths', () => {
    expect(matchPath('/about', '/other')).toBeNull()
  })
  it('decodes URI components', () => {
    expect(matchPath('/users/[id]', '/users/hello%20world')).toEqual({ id: 'hello world' })
  })

  it('falls back to raw string on malformed percent-encoding', () => {
    const result = matchPath('/users/[id]', '/users/%GG')
    expect(result).toBeDefined()
    expect(result!.id).toBe('%GG')
  })
  it('matches nested params', () => {
    expect(matchPath('/posts/[id]/comments/[commentId]', '/posts/1/comments/2')).toEqual({
      id: '1', commentId: '2',
    })
  })
})

describe('matchRoute', () => {
  const routes = [
    { path: '/about', name: 'about' },
    { path: '/users/[id]', name: 'user' },
    { path: '/users/settings', name: 'settings' },
  ]
  it('matches exact paths', () => {
    expect(matchRoute(routes, '/about')).toEqual({ route: routes[0], params: {} })
  })
  it('matches dynamic routes', () => {
    expect(matchRoute(routes, '/users/42')).toEqual({ route: routes[1], params: { id: '42' } })
  })
  it('prefers static over dynamic', () => {
    expect(matchRoute(routes, '/users/settings')).toEqual({ route: routes[2], params: {} })
  })
  it('returns null for unmatched', () => {
    expect(matchRoute(routes, '/unknown')).toBeNull()
  })
})

describe('createPath', () => {
  it('joins pathname, search, hash', () => {
    expect(createPath({ pathname: '/hello', search: '?q=1', hash: '#top' })).toBe('/hello?q=1#top')
  })
  it('handles missing search and hash', () => {
    expect(createPath({ pathname: '/hello' })).toBe('/hello')
  })
  it('adds leading ? and # if missing', () => {
    expect(createPath({ pathname: '/hello', search: 'q=1', hash: 'top' })).toBe('/hello?q=1#top')
  })
})

describe('parseLocation', () => {
  it('parses URL strings', () => {
    const result = parseLocation('https://example.com/hello?q=1#top')
    expect(result.pathname).toBe('/hello')
    expect(result.search).toBe('?q=1')
    expect(result.hash).toBe('#top')
  })
})
