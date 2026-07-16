import { Link } from '@cyb3rcore/reactify/client'

export const rsc = true

export function getMeta() {
  return { title: 'RSC Link Demo' }
}

export default function RscLinkDemo() {
  return (
    <div>
      <h1>RSC Link Demo</h1>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
    </div>
  )
}
