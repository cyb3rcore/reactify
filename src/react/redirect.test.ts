// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { redirect, isRedirectError, RedirectError } from './redirect.js'

describe('redirect', () => {
  it('throws a RedirectError with the given location and default status 307', () => {
    try {
      redirect('/login')
      // Should not reach here
      expect.unreachable()
    } catch (err) {
      expect(isRedirectError(err)).toBe(true)
      expect(err).toBeInstanceOf(RedirectError)
      expect((err as RedirectError).location).toBe('/login')
      expect((err as RedirectError).status).toBe(307)
    }
  })

  it('throws a RedirectError with custom status code', () => {
    try {
      redirect('/admin', 302)
    } catch (err) {
      expect((err as RedirectError).status).toBe(302)
      expect((err as RedirectError).location).toBe('/admin')
    }
  })

  it('throws a RedirectError with absolute URLs', () => {
    try {
      redirect('https://example.com', 301)
    } catch (err) {
      expect((err as RedirectError).location).toBe('https://example.com')
      expect((err as RedirectError).status).toBe(301)
    }
  })
})

describe('RedirectError', () => {
  it('has the correct error name and message', () => {
    const err = new RedirectError('/login', 302)
    expect(err.name).toBe('RedirectError')
    expect(err.message).toContain('/login')
    expect(err.digest).toBe('__reactify_redirect__')
  })
})

describe('isRedirectError', () => {
  it('returns true for RedirectError instances', () => {
    const err = new RedirectError('/login')
    expect(isRedirectError(err)).toBe(true)
  })

  it('returns true for duck-typed objects with the digest', () => {
    expect(isRedirectError({ digest: '__reactify_redirect__', location: '/', status: 302 })).toBe(
      true,
    )
  })

  it('returns false for regular errors', () => {
    expect(isRedirectError(new Error('nope'))).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isRedirectError(null)).toBe(false)
    expect(isRedirectError(undefined)).toBe(false)
  })
})
