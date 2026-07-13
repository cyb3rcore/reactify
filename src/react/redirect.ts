const REDIRECT_DIGEST = '__reactify_redirect__'

export class RedirectError extends Error {
  location: string
  status: number
  digest: string = REDIRECT_DIGEST

  constructor(to: string, status: number = 307) {
    super(`Redirect to ${to}`)
    this.name = 'RedirectError'
    this.location = to
    this.status = status
  }
}

export function redirect(to: string, status: number = 307): never {
  throw new RedirectError(to, status)
}

export function isRedirectError(err: unknown): err is RedirectError {
  return (
    err != null &&
    typeof err === 'object' &&
    (err as Record<string, unknown>).digest === REDIRECT_DIGEST
  )
}
