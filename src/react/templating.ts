// @ts-nocheck
import { createHtmlTemplateFunction, removeHtmlModuleScripts } from '../vite/utils.js'

export function createHtmlTemplates(source, config) {
  const el = '<!-- element -->'

  const universal = source.split(el)
  const serverOnlyRaw = removeClientModule(source, config)
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

function removeClientModule(html) {
  return removeHtmlModuleScripts(html)
}
