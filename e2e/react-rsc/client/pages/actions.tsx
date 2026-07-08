import { useActionState } from 'react'
import { increment } from '../actions'

export const rsc = true

export default function Actions() {
  const [count, formAction] = useActionState(increment, 0)
  return (
    <div>
      <h1>RSC Server Actions</h1>
      <form action={formAction}>
        <output>{count}</output>
        <button>Increment</button>
      </form>
    </div>
  )
}
