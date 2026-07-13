import { redirect } from 'reactify'

export const rsc = true

export function onEnter() {
  redirect('/rsc-page', 302)
}

export default function RedirectMe() {
  return <h1>Should not render</h1>
}
