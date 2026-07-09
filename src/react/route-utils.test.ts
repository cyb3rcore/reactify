import { describe, it, expect } from 'vitest'
import { filePathToRoutePath } from './route-utils.js'

describe('filePathToRoutePath', () => {
  it('converts /pages/index.jsx to /', () => {
    expect(filePathToRoutePath('/pages/index.jsx')).toBe('/')
  })

  it('converts /pages/about.jsx to /about', () => {
    expect(filePathToRoutePath('/pages/about.jsx')).toBe('/about')
  })

  it('converts /pages/blog/[slug].jsx to /blog/:slug', () => {
    expect(filePathToRoutePath('/pages/blog/[slug].jsx')).toBe('/blog/:slug')
  })

  it('converts /pages/[...catchAll].jsx to /:catchAll*', () => {
    expect(filePathToRoutePath('/pages/[...catchAll].jsx')).toBe('/:catchAll*')
  })

  it('handles pages/index without leading slash', () => {
    expect(filePathToRoutePath('pages/index.tsx')).toBe('/')
  })

  it('handles src/pages/ prefix', () => {
    expect(filePathToRoutePath('src/pages/about.tsx')).toBe('/about')
  })

  it('handles /src/pages/ prefix', () => {
    expect(filePathToRoutePath('/src/pages/about.tsx')).toBe('/about')
  })

  it('handles .ts extension', () => {
    expect(filePathToRoutePath('/pages/api/data.ts')).toBe('/api/data')
  })

  it('preserves trailing index removal', () => {
    expect(filePathToRoutePath('/pages/blog/index.jsx')).toBe('/blog')
  })

  it('handles paths without pages/ prefix', () => {
    // No pages/ prefix — falls through to leading / addition
    const result = filePathToRoutePath('random/file.jsx')
    expect(result).toBe('/random/file')
  })
})
