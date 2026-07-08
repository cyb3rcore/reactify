import { getServer } from 'reactify/server'

export const rsc = true

export function onEnter({ req, reply, server }: { req: any; reply: any; server: any }) {
  return { reqHeaders: req?.headers, hasServer: !!server }
}

export default function Index() {
  const server = getServer()
  return (
    <div>
      <p>Context bridge test</p>
      {server && <span>onEnter ran</span>}
    </div>
  )
}
