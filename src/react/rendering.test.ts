// Tests for React SSR rendering functions: onShellReady, onAllReady, createRenderFunction, renderSSR,
// streamShell, sendClientOnlyShell, and createHtmlFunction.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import { createElement } from 'react'
import { createHead } from '@unhead/react/server'
import { onShellReady, onAllReady, createRenderFunction, renderSSR, createHtmlFunction, sendClientOnlyShell, streamShell } from './rendering.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

// ---- Section: onShellReady ----
describe('onShellReady', () => {
  // When given a valid React element, expect a Readable stream
  it('returns a Readable for valid React element', async () => {
    const result = await onShellReady(createElement('div', null, 'hello'))
    expect(result).toBeInstanceOf(Readable)
  })

  // When null is passed as element, expect no throw and a Readable stream
  it('handles null element without throwing', async () => {
    // Regression: null as element should not throw — renderToReadableStream handles it
    const result = await onShellReady(null as unknown as Parameters<typeof onShellReady>[0])
    expect(result).toBeInstanceOf(Readable)
  })
})

// ---- Section: onAllReady ----
describe('onAllReady', () => {
  // When given a valid React element via onAllReady, expect a Readable stream
  it('returns a Readable for valid React element', async () => {
    const result = await onAllReady(createElement('div', null, 'hello'))
    expect(result).toBeInstanceOf(Readable)
  })

  // When awaiting allReady completion, expect a Readable with streamed content
  it('waits for allReady', async () => {
    const result = await onAllReady(createElement('div', null, 'streamed'))
    expect(result).toBeInstanceOf(Readable)
  })
})

// ---- Section: createRenderFunction ----
describe('createRenderFunction', () => {
  // When creating a render function with routes, expect it to be callable
  it('creates a render function attached to reply', async () => {
    const app = createElement('div', null, 'test')
    const renderFn = await createRenderFunction({
      routes: [{ path: '/' }],
      create: () => app,
    })
    expect(typeof renderFn).toBe('function')
  })

  // When the render function is invoked, expect routes and context to be returned
  it('render function returns routes and context', async () => {
    const app = createElement('div', null, 'test')
    const renderFn = await createRenderFunction({
      routes: [{ path: '/' }],
      create: () => app,
    })
    const mockReply = {
      request: { route: { streaming: false, app } },
    } as unknown as FastifyReply

    const result = await renderFn.call(mockReply)
    expect(result).toHaveProperty('routes')
    expect(result).toHaveProperty('context')
    expect(result.routes).toEqual([{ path: '/' }])
  })

  // When route.streaming is enabled, expect the streaming render path to be used
  it('uses streaming path when route.streaming is true', async () => {
    const app = createElement('div', null, 'streaming-content')
    const renderFn = await createRenderFunction({
      routes: [{ path: '/stream' }],
      create: () => app,
    })
    const mockReply = {
      request: { route: { streaming: true, app } },
    } as unknown as FastifyReply

    const result = await renderFn.call(mockReply)
    expect(result).toHaveProperty('body')
  })
})

// ---- Section: renderSSR ----
describe('renderSSR', () => {
  // When rendering SSR with a route table, expect a ReadableStream
  it('returns a ReadableStream', async () => {
    const stream = await renderSSR('/', [
      { path: '/', component: () => createElement('div', null, 'home') },
    ])
    expect(stream).toBeInstanceOf(ReadableStream)
  })
})

// ---- Section: streamShell ----
describe('streamShell', () => {
  // When streaming a shell with templates and body content, expect a Readable stream
  it('returns a Readable stream', () => {
    const templates = {
      beforeElement: () => '<html><body><div id="root">',
      afterElement: () => '</div></body></html>',
    }
    const context = { useHead: [] }
    const body = Readable.from(['hello'])
    const stream = streamShell(templates, context, body)
    expect(stream).toBeInstanceOf(Readable)
  })

  // When no body is provided, expect a valid Readable stream
  it('works without body', () => {
    const templates = {
      beforeElement: () => '<html><body>',
      afterElement: () => '</body></html>',
    }
    const context = { useHead: [] }
    const stream = streamShell(templates, context, undefined)
    expect(stream).toBeInstanceOf(Readable)
  })
})

// ---- Section: sendClientOnlyShell ----
describe('sendClientOnlyShell', () => {
  // When sending a client-only shell with templates and head context, expect an HTML string
  it('returns an HTML string', async () => {
    const templates = {
      beforeElement: () => '<div id="root">',
      afterElement: () => '</div>',
    }
    const head = createHead()
    const context = { useHead: head }
    const html = await sendClientOnlyShell(templates, context)
    expect(typeof html).toBe('string')
    expect(html).toContain('<div id="root">')
  })
})

// ---- Section: createHtmlFunction ----
describe('createHtmlFunction', () => {
  // When creating an HTML function from a source template, expect it to be callable
  it('returns a function', async () => {
    const source = '<html><head></head><body><div id="root"><!-- element --></div></body></html>'
    const fn = await createHtmlFunction(source, {} as FastifyInstance, {} as Record<string, unknown>)
    expect(typeof fn).toBe('function')
  })

  // When the HTML function is invoked, expect this.render() to be called
  it('calls this.render() when invoked', async () => {
    const source = '<html><head></head><body><div id="root"><!-- element --></div></body></html>'
    const fn = await createHtmlFunction(source, {} as FastifyInstance, {} as Record<string, unknown>)

    const app = createElement('div', null, 'hello')
    const head = createHead()
    const routesWithToJSON = Object.assign([{ path: '/' }], {
      toJSON: () => [{ path: '/', id: undefined, name: undefined, layout: false, hasLayout: false, getData: false, getMeta: false, onEnter: false, rsc: false }],
    })
    const mockThis = {
      render: vi.fn().mockResolvedValue({
        routes: routesWithToJSON,
        context: { toJSON: () => ({}), useHead: head, head: {} },
        body: undefined,
      }),
      type: vi.fn(),
    }

    const result = await fn.call(mockThis as unknown as FastifyReply)
    expect(mockThis.render).toHaveBeenCalled()
    expect(result).toBeDefined()
  })
})
