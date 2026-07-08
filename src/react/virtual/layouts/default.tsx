// This file serves as a placeholder
// if no layouts/default.jsx file is provided

import { Suspense } from 'react'

import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return <Suspense>{children}</Suspense>
}
