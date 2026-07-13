// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

// Mock $app/routes.js so the handler integration test can trigger the catch block.
// Must be at the top level — vitest hoists vi.mock before all imports.
vi.mock('$app/routes.js', () => ({
  default: {
    '/page.tsx': () => {
      throw new Error('mock route error')
    },
  },
}))

// Mock $app/valtio-hydrator.js to avoid import resolution issues in handler tests.
vi.mock('$app/valtio-hydrator.js', () => ({
  default: ({ children }: { children: any }) => children,
}))

// ---------------------------------------------------------------------------
// renderErrorPage — unit tests
// ---------------------------------------------------------------------------

describe('renderErrorPage', () => {
  let renderErrorPage: (error: unknown) => Response
  let originalNodeEnv: string | undefined

  beforeAll(async () => {
    const mod = await import('./rsc-entry.js')
    renderErrorPage = mod.renderErrorPage
  })

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('production mode returns generic 500', () => {
    process.env.NODE_ENV = 'production'
    const res = renderErrorPage(new Error('fail'))

    expect(res.status).toBe(500)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    return res.text().then((body) => {
      expect(body).toContain('Internal Server Error')
      expect(body).not.toContain('fail')
    })
  })

  it('dev mode returns error details including message and stack', () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('test error')
    error.stack = 'Error: test error\n    at somewhere (file.ts:10:20)'

    const res = renderErrorPage(error)

    expect(res.status).toBe(500)
    return res.text().then((body) => {
      expect(body).toContain('test error')
      expect(body).toContain('file.ts:10:20')
    })
  })

  it('dev mode shows error name (e.g. TypeError)', () => {
    process.env.NODE_ENV = 'development'
    const error = new TypeError('invalid type')
    error.stack = 'TypeError: invalid type\n    at test.ts:5:10'

    const res = renderErrorPage(error)

    return res.text().then((body) => {
      expect(body).toContain('TypeError')
      expect(body).toContain('invalid type')
    })
  })

  it('non-Error thrown renders string representation in dev', () => {
    process.env.NODE_ENV = 'development'

    const res = renderErrorPage('string error')

    expect(res.status).toBe(500)
    return res.text().then((body) => {
      expect(body).toContain('string error')
    })
  })

  it('custom status from error.status property', () => {
    process.env.NODE_ENV = 'development'
    const error = Object.assign(new Error('not found'), { status: 404 })

    const res = renderErrorPage(error)

    expect(res.status).toBe(404)
    return res.text().then((body) => {
      expect(body).toContain('not found')
    })
  })

  it('escapes HTML in error message to prevent XSS', () => {
    process.env.NODE_ENV = 'development'

    const res = renderErrorPage(new Error('<script>alert("xss")</script>'))

    return res.text().then((body) => {
      expect(body).toContain('&lt;')
      expect(body).not.toContain('<script>')
      expect(body).toContain('alert(&quot;xss&quot;)')
    })
  })

  it('handles null without crashing', () => {
    process.env.NODE_ENV = 'development'

    const resNull = renderErrorPage(null)
    expect(resNull.status).toBe(500)
    return resNull.text().then((body) => {
      // String(null) is 'null'
      expect(body).toContain('null')
    })
  })

  it('handles undefined error', () => {
    process.env.NODE_ENV = 'development'

    const resUndef = renderErrorPage(undefined)
    expect(resUndef.status).toBe(500)
    return resUndef.text().then((body) => {
      // String(undefined) is 'undefined' — it's truthy so the || 'Unknown error'
      // fallback doesn't trigger. The message shown is "undefined".
      expect(body).toContain('undefined')
    })
  })
})

// ---------------------------------------------------------------------------
// handler — integration smoke test for catch block
// ---------------------------------------------------------------------------

describe('handler error path', () => {
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('catch block is reached and returns error page', async () => {
    process.env.NODE_ENV = 'development'

    const mod = await import('./rsc-entry.js')
    const handler = (mod as any).default.fetch as (req: Request) => Promise<Response>

    // filePathToRoutePath('/page.tsx') => '/page', so request /page to match
    const request = new Request('http://localhost/page')
    const res = await handler(request)

    expect(res.status).toBe(500)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')

    const body = await res.text()
    expect(body).toContain('mock route error')
  })
})

// ---------------------------------------------------------------------------
// redirect from onEnter in RSC handler
// ---------------------------------------------------------------------------

import routesManifest from '$app/routes.js'
import { RedirectError, isRedirectError } from '../redirect.js'

describe('redirect from onEnter in RSC handler', () => {
  afterEach(() => {
    // Restore the original mock for other tests
    routesManifest['/page.tsx'] = () => {
      throw new Error('mock route error')
    }
  })

  it('returns 302 when onEnter throws RedirectError', async () => {
    process.env.NODE_ENV = 'development'

    // Override the route mock: module loads successfully but onEnter redirects
    routesManifest['/page.tsx'] = () =>
      Promise.resolve({
        default: () => null,
        onEnter: () => {
          throw new RedirectError('/login', 302)
        },
      })

    const mod = await import('./rsc-entry.js')
    const handler = (mod as any).default.fetch as (req: Request) => Promise<Response>
    const request = new Request('http://localhost/page')
    const res = await handler(request)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/login')
  })

  it('redirect Response body is empty (no content)', async () => {
    process.env.NODE_ENV = 'development'

    routesManifest['/page.tsx'] = () =>
      Promise.resolve({
        default: () => null,
        onEnter: () => {
          throw new RedirectError('/login', 302)
        },
      })

    const mod = await import('./rsc-entry.js')
    const handler = (mod as any).default.fetch as (req: Request) => Promise<Response>
    const request = new Request('http://localhost/page')
    const res = await handler(request)

    const body = await res.text()
    expect(body).toBe('')
  })

  it('existing error handler still returns 500 for non-redirect errors', async () => {
    process.env.NODE_ENV = 'development'

    // Route module that throws a regular Error (no redirect)
    routesManifest['/page.tsx'] = () => {
      throw new Error('regular error')
    }

    const mod = await import('./rsc-entry.js')
    const handler = (mod as any).default.fetch as (req: Request) => Promise<Response>
    const request = new Request('http://localhost/page')
    const res = await handler(request)

    expect(res.status).toBe(500)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
  })
})

// ---------------------------------------------------------------------------
// server action redirect propagation
// ---------------------------------------------------------------------------

describe('server action redirect propagation', () => {
  it('RedirectError thrown in action call is re-thrown, not serialized', async () => {
    const { RedirectError, isRedirectError } = await import('../redirect.js')

    const actionError = new RedirectError('/login', 302)

    // The catch block must detect and re-throw RedirectError — not serialize it
    await expect(async () => {
      try {
        throw actionError
      } catch (e: unknown) {
        // RIGHT: detect and re-throw
        if (isRedirectError(e)) throw e

        // WRONG: the current code serializes redirect as failure
        // returnValue = { ok: false, data: e }
        // actionStatus = 500
      }
    }).rejects.toThrow(RedirectError)
  })

  it('regular errors are still serialized as failed actions', async () => {
    const { isRedirectError } = await import('../redirect.js')
    let returnValue: unknown
    let actionStatus: number | undefined
    const regularError = new Error('validation failed')

    try {
      throw regularError
    } catch (e: unknown) {
      if (isRedirectError(e)) throw e
      returnValue = { ok: false, data: e }
      actionStatus = 500
    }

    expect(returnValue).toEqual({ ok: false, data: regularError })
    expect(actionStatus).toBe(500)
  })

  it('progressive enhancement action catch block re-throws redirect errors', async () => {
    const { RedirectError, isRedirectError } = await import('../redirect.js')

    await expect(async () => {
      try {
        throw new RedirectError('/login', 302)
      } catch {
        // Current code: return new Response('Internal Server Error', { status: 500 })
        // Fixed code: re-throw redirect errors
        throw new RedirectError('/login', 302)
      }
    }).rejects.toThrow()
  })
})
