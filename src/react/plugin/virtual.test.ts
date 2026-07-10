import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadVirtualModule, prefix, resolveId } from './virtual.js'

describe('virtual module resolution', () => {
  it('resolveId anchors built-in $app modules at the Vite root', async () => {
    const resolved = await resolveId.call({ root: import.meta.dirname }, '$app/layouts.ts')

    expect(resolved).toBe('\0$app/layouts.ts')

    // Strip \0 prefix before splitting by the $app/ prefix pattern
    const cleanResolved = resolved!.charCodeAt(0) === 0 ? resolved!.slice(1) : resolved!
    const [, virtual] = cleanResolved.split(prefix)
    expect(virtual).toBe('layouts.ts')
    expect(loadVirtualModule(virtual)!.code).toContain("import.meta.glob('/layouts/*.{jsx,tsx}')")
  })

  it('resolveId leaves project overrides as real files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reactify-virtual-'))
    const override = join(root, 'layouts.ts')
    await writeFile(override, 'export default {}')

    expect(await resolveId.call({ root }, '$app/layouts.ts')).toBe(override)

    await rm(root, { recursive: true, force: true })
  })
})
