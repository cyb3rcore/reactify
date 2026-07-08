export const rsc = true

function Throws() {
  throw new Error('RSC error boundary test')
}

export default function ErrorPage() {
  return (
    <div>
      <h1>Error test</h1>
      <Throws />
    </div>
  )
}
