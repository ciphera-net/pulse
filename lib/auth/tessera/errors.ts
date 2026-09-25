import { InvalidCredentialsError } from '@ciphera-net/tessera'

/**
 * True when an OPAQUE ceremony rejected the email/password the person typed.
 *
 * 🔴 A WRONG PASSWORD HAS NO HTTP STATUS. OPAQUE detects it in the BROWSER: the
 * server's reply to `…/start` doesn't verify, the SDK throws
 * `InvalidCredentialsError`, and `…/finish` is never sent. An error mapper that
 * only recognises `ApiError` 401/403 therefore never sees it, and one that
 * falls back to `err.message` shows the person "tessera: invalid credentials".
 * A customer read that as a domain bug (PULSE-61, pulse#785).
 *
 * The `name` check is kept alongside `instanceof` on purpose: a second copy of
 * the SDK in the bundle (a nested install, a chunk split) makes `instanceof`
 * false for an error that is exactly this one.
 */
export function isInvalidCredentials(err: unknown): boolean {
  return (
    err instanceof InvalidCredentialsError ||
    (err as { name?: unknown } | null)?.name === 'InvalidCredentialsError'
  )
}
