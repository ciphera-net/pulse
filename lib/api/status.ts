import { ApiError } from './client'

/**
 * HTTP status from an ApiError, a wrapper carrying one, or a status in the text.
 *
 * The Tessera SDK drives the OPAQUE transport, so an ApiError from a re-auth
 * ceremony can reach the caller wrapped (as `cause`) rather than as itself, and
 * `instanceof` alone silently loses the status. Shared by every step-up dialog
 * (delete account, remove a passkey) so their "wrong password" answers agree.
 */
export function readStatus(err: unknown): number | null {
  for (const candidate of [err, (err as { cause?: unknown } | null)?.cause]) {
    if (candidate instanceof ApiError) return candidate.status
    const s = (candidate as { status?: unknown } | null)?.status
    if (typeof s === 'number' && s >= 100 && s < 600) return s
  }
  if (err instanceof Error) {
    const m = err.message.match(/\b(4\d{2}|5\d{2})\b/)
    if (m) return Number(m[1])
  }
  return null
}
