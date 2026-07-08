export function onEnter({ req, reply, server }: { req: any; reply: any; server: any }) {
  return { reqHeaders: req?.headers, hasServer: !!server }
}

export default function Index({ data }: { data: any }) {
  return (
    <div>
      <p>Context bridge test</p>
      {data?.hasServer && <span>onEnter ran</span>}
    </div>
  )
}
