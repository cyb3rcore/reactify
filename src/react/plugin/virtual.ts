import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { findExports } from 'mlly'

const virtualRoot = resolve(import.meta.dirname, '..', 'virtual')

/**
 * Virtual modules that the `$app/` prefix resolves to.
 *
 * Each entry is either a filename (e.g. `core.tsx`) or a directory prefix
 * (e.g. `layouts/` — matches `$app/layouts/default`).
 *
 * Adding a new source file to `src/react/virtual/` requires adding its name
 * here. The assertion below detects stale entries at startup.
 */
const virtualModules = buildVirtualModuleList()

function buildVirtualModuleList(): string[] {
  const known: string[] = [
    'mount.ts',
    'resource.ts',
    'routes.ts',
    'layouts.ts',
    'layouts/',
    'create.tsx',
    'root.tsx',
    'context.ts',
    'core.tsx',
    'index.ts',
    'rsc-entry.tsx',
    'ssr-entry.tsx',
    'rsc-content.tsx',
    'valtio-hydrator.tsx',
  ]

  if (process.env.NODE_ENV !== 'test') {
    // Verify all non-test files in the virtual directory are registered
    try {
      const onDisk = readdirSync(virtualRoot, { withFileTypes: true })
      for (const entry of onDisk) {
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx') || entry.name.endsWith('.d.ts')) continue
        if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          if (!known.includes(entry.name) && !known.includes(entry.name.replace(/\.(ts|tsx)$/, '') + '/')) {
            console.warn(
              `[vite-plugin-reactify] Virtual module "${entry.name}" exists on disk ` +
              `but is not registered. Add it to the virtualModules array in virtual.ts.`,
            )
          }
        }
      }
    } catch {
      // virtual directory may not exist in all contexts (e.g. test runners)
    }
  }

  return known
}

export const prefix = /^\/?\$app\//

export async function resolveId(
  this: { root: string | null },
  id: string,
  importer?: string,
): Promise<string | undefined> {
  // Paths are prefixed with .. on Windows by the glob import
  if (process.platform === 'win32' && /^\.\.\/[C-Z]:/.test(id)) {
    return id.substring(3)
  }

  // Resolve relative imports from virtual module contexts (e.g. $app/create.js
  // importing ./core). The relative import is resolved against the importer's
  // virtual directory and checked against known virtual modules or physical files.
  if (importer && importer.startsWith('/$app/') && (id.startsWith('./') || id.startsWith('../'))) {
    const importerDir = importer.substring(0, importer.lastIndexOf('/'))
    const resolvedPath = new URL(id, `http://localhost${importerDir}/`).pathname
    // Check if resolved path matches a virtual module
    if (resolvedPath.startsWith('/$app/')) {
      const virtual = resolvedPath.slice('/$app/'.length)
      if (virtual && virtualModules.includes(virtual)) {
        const override = loadVirtualModuleOverride(this.root ?? '', virtual)
        if (override) return override
        return `/$app/${virtual}`
      }
    }
    // If not a virtual module, resolve as physical file relative to the virtual root.
    // This handles imports like ../router from a virtual module in src/react/virtual/
    // — ../router resolves to src/react/router.ts as a physical file.
    // Strip any existing .js extension so the resolver can try all source extensions.
    const normalizedId = id.replace(/\.(?:js|mjs|cjs|ts|tsx|jsx)$/, '')
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs']
    for (const ext of extensions) {
      const physicalPath = resolve(virtualRoot, normalizedId + ext)
      if (existsSync(physicalPath)) {
        return physicalPath
      }
    }
  }

  if (prefix.test(id)) {
    const [, virtual] = id.split(prefix)
    if (virtual) {
      const override = loadVirtualModuleOverride(this.root ?? '', virtual)
      if (override) {
        return override
      }
      return `/$app/${virtual}`
    }
  }
}

export function loadVirtualModule(
  virtualInput: string,
): { code: string; map: null } | undefined {
  let virtual = virtualInput
  if (!virtualModules.includes(virtual)) {
    return
  }
  // Strip file extension so mount.js matches mount.ts, rsc-entry.js matches rsc-entry.tsx, etc.
  // resolveId may return an extensionless path like 'core' when resolving relative imports,
  // and RSC build entries may include extensions like '$app/rsc-entry.js'.
  const baseName = virtual.replace(/\.\w+$/, '')
  // Try exact path first, then append common extensions
  const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs']
  for (const ext of extensions) {
    const codePath = resolve(virtualRoot, baseName + ext)
    try {
      const code = readFileSync(codePath, 'utf8')
      return { code, map: null }
    } catch {
      continue
    }
  }
}

virtualModules.includes = function (virtual: string) {
  if (!virtual) {
    return false
  }
  // Strip file extension so mount.js matches mount.ts, index.js matches index.ts, etc.
  const normalized = virtual.replace(/\.\w+$/, '')
  for (const entry of this) {
    const entryBase = entry.replace(/\.\w+$/, '')
    if (normalized.startsWith(entryBase)) {
      return true
    }
  }
  return false
}

function loadVirtualModuleOverride(
  viteProjectRoot: string,
  virtualInput: string,
): string | undefined {
  let virtual = virtualInput
  if (!virtualModules.includes(virtual)) {
    return
  }
  let overridePath = resolve(viteProjectRoot, virtual)
  if (existsSync(overridePath)) {
    return overridePath
  }
}

export function loadSource(id: string): string {
  const filePath = id.replace(/\?client$/, '').replace(/\?server$/, '')
  return readFileSync(filePath, 'utf8')
}

export function createPlaceholderExports(source: string): string {
  let pExports = ''
  for (const exp of findExports(source)) {
    switch (exp.type) {
      case 'named':
        for (const name of exp.names) {
          pExports += `export const ${name} = {}\n`
        }
        break
      case 'default':
        pExports += `export default {}\n`
        break
      case 'declaration':
        pExports += `export const ${exp.name} = {}\n`
        break
    }
  }
  return pExports
}
