import { getReq } from 'reactify/server'

export default function WithReq() {
  const req = getReq()
  return <p>req available: <span>{String(!!req)}</span></p>
}
