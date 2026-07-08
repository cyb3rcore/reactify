import { getServer } from 'reactify/server'

export default function WithServer() {
  const server = getServer()
  return <p>server available: <span>{String(!!server)}</span></p>
}
