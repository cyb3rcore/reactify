import type { ReactNode } from 'react'

export default function DefaultLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header>E2E Layout Header</header>
      <main>{children}</main>
      <footer>E2E Layout Footer</footer>
    </div>
  )
}
