export default function User({ params }: { params: Record<string, string> }) {
  return <p>{`User: ${params.id}`}</p>
}
