import { getReq } from '@cyb3rcore/reactify/server'

export const rsc = true

export default function WithReq() {
  const req = getReq()
  return (
    <p>
      req available: <span>{String(!!req)}</span>
    </p>
  )
}
