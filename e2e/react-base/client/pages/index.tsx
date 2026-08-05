import DefaultLayout from '../layouts/default'
import { Link } from '@cyb3rcore/reactify'

export function getMeta() {
  return { title: 'React base e2e' }
}

export function getData() {
  return { message: 'Hello from getData' }
}

export const layout = DefaultLayout

export default function Index() {
  return (
    <>
      <p>React base e2e</p>
      <nav>
        <a href="/users/settings">Settings</a>
        <a href="/users/42">User 42</a>
        <a href="/users/settings?tab=profile#prefs">Settings with params</a>
        <a href="https://example.com" target="_blank">
          External
        </a>
      </nav>
      <Link to="/users/settings" className="e2e-link" data-e2e-link="yes">
        Settings via Link
      </Link>
    </>
  )
}
