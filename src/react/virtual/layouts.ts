import { lazy, type ComponentType } from 'react'

const DefaultLayout = () => import('$app/layouts/default.js')

const appLayouts: Record<string, () => Promise<unknown>> =
  import.meta.glob('/layouts/*.{jsx,tsx}')

if (
  !Object.keys(appLayouts).some((path) =>
    path.match(/\/layouts\/default\.(j|t)sx/),
  )
) {
  appLayouts['/layouts/default.tsx'] =
    DefaultLayout as unknown as () => Promise<unknown>
}

export default Object.fromEntries(
  Object.keys(appLayouts).map((path) => {
    const name = path.slice(9, -4)
    return [name, lazy(appLayouts[path] as unknown as () => Promise<{ default: ComponentType<unknown> }>)]
  }),
)
