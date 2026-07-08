import { createHtmlTemplateFunction, removeHtmlModuleScripts } from '../vite/utils.js'

export function createHtmlTemplates(source: string, config: Record<string, unknown>): {
  universal: { beforeElement: (data?: Record<string, unknown>) => string; afterElement: (data?: Record<string, unknown>) => string }
  serverOnly: { beforeElement: (data?: Record<string, unknown>) => string; afterElement: (data?: Record<string, unknown>) => string }
} {
  const el = '<!-- element -->'

  const universal = source.split(el)
  const serverOnlyRaw = removeClientModule(source)
  const serverOnly = serverOnlyRaw.split(el)

  return {
    // Templates for client-only and universal rendering
    universal: {
      beforeElement: createHtmlTemplateFunction(universal[0]),
      afterElement: createHtmlTemplateFunction(universal[1]),
    },
    // Templates for server-only rendering
    serverOnly: {
      beforeElement: createHtmlTemplateFunction(serverOnly[0]),
      afterElement: createHtmlTemplateFunction(serverOnly[1]),
    },
  }
}

function removeClientModule(html: string) {
  return removeHtmlModuleScripts(html)
}
