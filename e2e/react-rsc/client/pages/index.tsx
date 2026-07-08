export function getMeta() {
  return { title: 'RSC e2e - Home' }
}

export default function Home() {
  return (
    <div>
      <h1>RSC e2e - Home</h1>
      <p>non-RSC page</p>
      <a href="/rsc-page">RSC Page</a>
      <a href="/rsc-client">RSC Client</a>
    </div>
  )
}
