import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, parse, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import FastifyStatic from '@fastify/static'
import type { ClientEntries, ClientModule } from '../types/client.js'
import type { ProdRuntimeConfig } from '../types/options.js'
import type { SerializableViteConfig } from '../types/vite-configs.js'
import { resolveIfRelative } from '../ioutils.js'
import { transformAssetUrls } from '../html-assets.js'
import type { ReactifyViteDecorationPriorToSetup } from './support.js'

type EntryBundle =
  | {
      default?: unknown
    }
  | Record<string, unknown>

function fileUrl(str: string): string {
  if (typeof str !== 'string') {
    throw new Error('Expected a string')
  }

  let pathName = resolve(str).replace(/\\/g, '/')

  if (pathName[0] !== '/') {
    pathName = `/${pathName}`
  }

  return encodeURI(`file://${pathName}`)
}

async function loadBundle(
  distOutDir: string,
  entryPath: string,
  rootDir: string,
  config: ProdRuntimeConfig,
): Promise<EntryBundle> {
  const parsedNamed = parse(entryPath).name
  const bundleFiles = [`${parsedNamed}.js`, `${parsedNamed}.mjs`]

  const fixWin32Path =
    process.platform === 'win32'
      ? (filePath: string) => new URL(fileUrl(filePath))
      : (filePath: string) => filePath

  let getBundlePath: (serverFile: string) => string | URL
  if (isAbsolute(distOutDir)) {
    getBundlePath = (serverFile: string) => fixWin32Path(resolve(distOutDir, serverFile))
  } else {
    const { packageDirectory } = await import('package-directory')
    const pkgDir = await packageDirectory({ cwd: rootDir })
    if (!pkgDir) {
      throw new Error(`Could not find package root from: ${rootDir}`)
    }
    getBundlePath = (serverFile: string) => fixWin32Path(resolve(pkgDir, distOutDir, serverFile))
  }

  let bundlePath: string | URL | undefined

  for (const serverFile of bundleFiles) {
    bundlePath = getBundlePath(serverFile)
    if (existsSync(bundlePath)) {
      break
    }
  }
  let bundle = await import(bundlePath as string)
  if (typeof bundle.default === 'function') {
    bundle = await bundle.default(config)
  }
  return bundle.default || bundle
}

async function loadEntries(
  config: ProdRuntimeConfig,
  viteConfig: SerializableViteConfig,
): Promise<ClientEntries> {
  if (config.spa) {
    return {}
  }

  const entries: ClientEntries = {}
  if (viteConfig.reactify?.entryPaths) {
    for (const [env, entryPath] of Object.entries(viteConfig.reactify.entryPaths)) {
      const bundle = await loadBundle(
        viteConfig.reactify.outDirs![env]!,
        entryPath,
        config.root,
        config,
      )
      if (bundle) {
        entries[env] = bundle as unknown as ClientModule
      }
    }
  }
  return entries
}

export async function setup(
  reactifyViteDecoration: ReactifyViteDecorationPriorToSetup,
): Promise<ClientModule | null> {
  const runtimeConfig = reactifyViteDecoration.runtimeConfig as ProdRuntimeConfig
  const { spa, viteConfig } = runtimeConfig
  let clientOutDir: string
  let ssrOutDir: string
  let assetsDir: string

  if (viteConfig.reactify?.outDirs) {
    const { outDirs } = viteConfig.reactify

    const { packageDirectory } = await import('package-directory')
    const outDirRoot = await packageDirectory({ cwd: runtimeConfig.root })
    if (!outDirRoot) {
      throw new Error(`Could not find package root from: ${runtimeConfig.root}`)
    }

    clientOutDir = resolveIfRelative(outDirs.client!, outDirRoot)
    ssrOutDir = resolveIfRelative(outDirs.ssr || '', outDirRoot)
    assetsDir = viteConfig.build.assetsDir
  } else {
    const outDir = resolveIfRelative(viteConfig.build!.outDir!, viteConfig.root!)

    clientOutDir = resolve(outDir, 'client')
    ssrOutDir = resolve(outDir, 'server')
    assetsDir = viteConfig.build!.assetsDir!
  }

  if (!existsSync(clientOutDir)) {
    throw new Error(`No client distribution bundle found at ${clientOutDir}.`)
  }

  if (!spa && !existsSync(ssrOutDir)) {
    throw new Error(`No SSR distribution bundle found at ${ssrOutDir}.`)
  }

  const registrationPrefix = runtimeConfig.prefix || ''
  const basePathname = URL.canParse(viteConfig.base ?? '')
    ? new URL(viteConfig.base!).pathname
    : viteConfig.base || '/'
  await reactifyViteDecoration.scope.register(async function assetFiles(scope: FastifyInstance) {
    const root = [resolve(clientOutDir, assetsDir)]
    if (existsSync(resolve(ssrOutDir, assetsDir))) {
      root.push(resolve(ssrOutDir, assetsDir))
    }
    await scope.register(FastifyStatic, {
      ...runtimeConfig.fastifyStaticOptions,
      root,
      prefix: join(registrationPrefix, basePathname, assetsDir).replace(/\\/g, '/'),
    })
  })

  await reactifyViteDecoration.scope.register(async function publicFiles(scope: FastifyInstance) {
    await scope.register(FastifyStatic, {
      ...runtimeConfig.fastifyStaticOptions,
      root: clientOutDir,
      prefix: join(registrationPrefix, basePathname).replace(/\\/g, '/'),
      index: false,
      wildcard: false,
      allowedPath(path: string) {
        return path !== '/index.html'
      },
    })
  })

  Object.defineProperty(runtimeConfig, 'hasRenderFunction', {
    writable: false,
    value: typeof runtimeConfig.createRenderFunction === 'function',
  })

  const entries = await loadEntries(runtimeConfig, viteConfig)

  const client: ClientModule | null = !runtimeConfig.spa
    ? await runtimeConfig.prepareClient(entries, reactifyViteDecoration.scope, runtimeConfig)
    : null

  const indexHtmlPath = join(clientOutDir, 'index.html')
  let indexHtml = await readFile(indexHtmlPath, 'utf8')
  if (runtimeConfig.baseAssetUrl) {
    indexHtml = await transformAssetUrls(
      indexHtml,
      viteConfig.base || '/',
      runtimeConfig.baseAssetUrl,
    )
  }

  reactifyViteDecoration.scope.decorateReply(
    'html',
    await runtimeConfig.createHtmlFunction(indexHtml, reactifyViteDecoration.scope, runtimeConfig),
  )

  if (runtimeConfig.hasRenderFunction && client) {
    const renderFunction = await runtimeConfig.createRenderFunction!(
      client,
      reactifyViteDecoration.scope,
      runtimeConfig,
    )
    reactifyViteDecoration.scope.decorateReply('render', renderFunction)
  }

  return client
}
