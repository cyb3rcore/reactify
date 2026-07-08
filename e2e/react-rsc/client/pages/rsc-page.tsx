export const rsc = true

export function getMeta() {
  return { title: 'RSC Page' }
}

export default function RscPage() {
  return (
    <div>
      <h1>RSC Page</h1>
      <p>Server-rendered timestamp: {Date.now()}</p>
    </div>
  )
}
