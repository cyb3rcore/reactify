import { Link } from '@cyb3rcore/reactify'

export function getMeta() {
  return { title: 'Link Demo' }
}

export default function LinkDemo() {
  return (
    <div>
      <h1>Link Demo Page</h1>
      <nav>
        <Link to="/rsc-page">RSC Page</Link>
        <Link to="/about">About</Link>
        <Link to="/rsc-page" prefetch={false}>
          RSC (no prefetch)
        </Link>
      </nav>
    </div>
  )
}
