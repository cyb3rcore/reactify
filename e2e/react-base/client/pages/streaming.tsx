import { Suspense } from 'react'

async function DelayedContent() {
  await new Promise((r) => setTimeout(r, 100))
  return <span>streamed content</span>
}

export default function StreamingPage() {
  return (
    <>
      <h2>Streaming SSR</h2>
      <Suspense fallback={<span>loading...</span>}>
        <DelayedContent />
      </Suspense>
    </>
  )
}
