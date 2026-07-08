import { proxy } from 'valtio'
export const store = proxy({ count: 42, message: 'Hello from Valtio!' })
