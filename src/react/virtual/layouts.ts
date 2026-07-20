import { lazy, type ComponentType } from 'react'

const appLayouts: Record<string, () => Promise<unknown>> = import.meta.glob('/layouts/*.{jsx,tsx}')

export const loaders = appLayouts

export default Object.fromEntries(
  Object.keys(appLayouts).map((path) => {
    const name = path.slice(9, -4)
    return [
      name,
      lazy(appLayouts[path] as unknown as () => Promise<{ default: ComponentType<unknown> }>),
    ]
  }),
)
