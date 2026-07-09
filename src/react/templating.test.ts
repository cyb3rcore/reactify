import { describe, it, expect } from 'vitest'
import { createHtmlTemplates } from './templating.js'

function stripTemplate(fn: (data?: Record<string, unknown>) => string): string {
  return fn()
}

describe('createHtmlTemplates', () => {
  const source = '<html><head></head><body><div id="root"><!-- element --></div><script type="module" src="/assets/client.js"></script></body></html>'

  it('creates universal and serverOnly template sets', () => {
    const templates = createHtmlTemplates(source, {})
    expect(templates).toHaveProperty('universal')
    expect(templates).toHaveProperty('serverOnly')
    expect(templates.universal).toHaveProperty('beforeElement')
    expect(templates.universal).toHaveProperty('afterElement')
    expect(templates.serverOnly).toHaveProperty('beforeElement')
    expect(templates.serverOnly).toHaveProperty('afterElement')
  })

  it('universal beforeElement includes content before <!-- element -->', () => {
    const templates = createHtmlTemplates(source, {})
    const before = stripTemplate(templates.universal.beforeElement)
    expect(before).toContain('<div id="root">')
    expect(before).not.toContain('</div>')
  })

  it('universal afterElement includes content after <!-- element -->', () => {
    const templates = createHtmlTemplates(source, {})
    const after = stripTemplate(templates.universal.afterElement)
    expect(after).toContain('</div>')
    expect(after).toContain('</body>')
    expect(after).toContain('</html>')
  })

  it('universal afterElement still contains the client script', () => {
    const templates = createHtmlTemplates(source, {})
    const after = stripTemplate(templates.universal.afterElement)
    // Universal templates keep the client module script for hydration
    expect(after).toContain('client.js')
  })

  it('serverOnly beforeElement splits before <!-- element -->', () => {
    const templates = createHtmlTemplates(source, {})
    const before = stripTemplate(templates.serverOnly.beforeElement)
    expect(before).toContain('<div id="root">')
    expect(before).not.toContain('</div>')
  })

  it('serverOnly afterElement removes the client module script', () => {
    const templates = createHtmlTemplates(source, {})
    const after = stripTemplate(templates.serverOnly.afterElement)
    // The client script is stripped from the server-only template (no hydration)
    expect(after).not.toContain('client.js')
  })

  it('works with minimal template (no script tags)', () => {
    const minimal = '<html><body><div id="root"><!-- element --></div></body></html>'
    const templates = createHtmlTemplates(minimal, {})
    expect(stripTemplate(templates.universal.beforeElement)).toContain('<div id="root">')
    expect(stripTemplate(templates.universal.afterElement)).toContain('</div>')
  })
})
