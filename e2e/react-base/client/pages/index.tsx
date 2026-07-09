import DefaultLayout from '../layouts/default'

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
        <a href="https://example.com" target="_blank">External</a>
      </nav>
    </>
  )
}
