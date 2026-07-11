import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, isAbsolute, parse as parsePath } from 'node:path'
import type { ResolvedConfig } from 'vite'

interface PluginContext {
  environment: {
    name: string
    config: ResolvedConfig
  }
}

const imageFileRE = /\.((png)|(jpg)|(svg)|(webp)|(gif))$/

interface RollupMeta {
  facadeModuleId?: string
  htmlPath?: string
  imports?: string[]
  viteMetadata?: { importedCss?: string[] }
  moduleIds?: string[]
  modules?: Record<string, { originalLength?: number }>
  [key: string]: unknown
}

export async function closeBundle(
  this: PluginContext,
  resolvedBundle: Record<string, RollupMeta> | undefined,
): Promise<void> {
  if (this.environment.name !== 'client' || !resolvedBundle) {
    return
  }
  const rawLimit = this.environment.config.build.assetsInlineLimit
  const assetsInlineLimit = typeof rawLimit === 'number' ? rawLimit : 0
  const { root, base } = this.environment.config
  let distDir: string
  if (isAbsolute(this.environment.config.build.outDir)) {
    distDir = this.environment.config.build.outDir
  } else {
    distDir = join(root, this.environment.config.build.outDir)
  }
  const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8')
  const pages = Object.fromEntries(
    Object.entries(resolvedBundle ?? {}).filter(([, meta]) => {
      if (meta.facadeModuleId?.includes('/pages/')) {
        meta.htmlPath = meta.facadeModuleId.replace(/.*pages\/(.*)\.(j|t)sx$/, 'html/$1.html')
        return true
      }
      return false
    }),
  )

  for (const page of Object.values(pages)) {
    const jsImports: string[] = (page.imports as string[]) ?? []
    const cssImports: string[] = (page.viteMetadata?.importedCss as string[]) ?? []
    const images: string[] =
      (page.moduleIds as string[])?.filter((img) => {
        return (
          (page.modules?.[img]?.originalLength ?? 0) > assetsInlineLimit && imageFileRE.test(img)
        )
      }) ?? []
    let imagePreloads = '\n'
    for (let image of images) {
      image = image.slice(root.length + 1)
      imagePreloads += `  <link rel="preload" as="image" crossorigin href="${base}${image}">\n`
    }
    let cssPreloads = ''
    for (const css of cssImports) {
      cssPreloads += `  <link rel="preload" as="style" crossorigin href="${base}${css}">\n`
    }
    let jsPreloads = ''
    for (const js of jsImports) {
      jsPreloads += `  <link rel="modulepreload" crossorigin href="${base}${js}">\n`
    }
    const pageHtml = appendHead(indexHtml, imagePreloads, cssPreloads, jsPreloads)
    writeHtml(page, pageHtml, distDir)
  }
}

function appendHead(html: string, ...tags: string[]): string {
  const content = tags.join('\n  ')
  return html.replace(/<head([^>]*)>/i, `<head$1>\n  ${content}`)
}

function writeHtml(page: Record<string, unknown>, pageHtml: string, distDir: string): void {
  const { dir, base } = parsePath(page.htmlPath as string)
  const htmlDir = join(distDir, dir)
  if (!existsSync(htmlDir)) {
    mkdirSync(htmlDir, { recursive: true })
  }
  writeFileSync(join(htmlDir, base), pageHtml)
}
