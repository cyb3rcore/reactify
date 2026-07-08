'use client'
import { useActionState } from 'react'

export default function CounterForm({ incrementAction }: { incrementAction: (prev: number) => Promise<number> }) {
  const [count, formAction] = useActionState(incrementAction, 0)

  return (
    <form action={formAction}>
      <output>{count}</output>
      <button>Increment</button>
    </form>
  )
}
