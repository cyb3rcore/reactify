import { getServer } from '@cyb3rcore/reactify/server'

export const rsc = true

export default function WithServer() {
  const server = getServer()
  return (
    <p>
      server available: <span>{String(!!server)}</span>
    </p>
  )
}
