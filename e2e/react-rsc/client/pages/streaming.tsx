import { Suspense } from 'react'

export const rsc = true

async function DelayedContent() {
  await new Promise((r) => setTimeout(r, 200))
  return <span>streamed content</span>
}

export default function StreamingPage() {
  return (
    <div>
      <h2>Streaming SSR</h2>
      <Suspense fallback={<span>loading...</span>}>
        <DelayedContent />
      </Suspense>
    </div>
  )
}
