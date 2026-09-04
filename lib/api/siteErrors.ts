import { ApiError } from './client'
import { getAuthErrorMessage } from '@ciphera-net/facet'

export interface SiteCreateError {
  /** A human message safe to show — the server's own where there is one. */
  message: string
  /** The server's machine code (DOMAIN_TAKEN, DOMAIN_PENDING_DELETION, …) when present. */
  code?: string
}

/**
 * The site API returns specific, human messages with codes (DOMAIN_INVALID,
 * DOMAIN_TAKEN, DOMAIN_PENDING_DELETION, DOMAIN_PRIVATE, …). They arrive in
 * ApiError.data, NOT in ApiError.message — the shared client fills `.message`
 * from the HTTP status, so a 409 reads "Something went wrong" and a 403 reads
 * "Invalid credentials" on a form with no credentials on it. Read the server's
 * own message; fall back only when there genuinely isn't one.
 *
 * This matters most on the setup wizard's site step: with the skip removed
 * (best-way-B), an unintelligible error would be a dead end, so the message
 * must say WHY the domain was refused and what to do about it.
 */
export function siteCreateError(err: unknown): SiteCreateError {
  if (err instanceof ApiError && err.data) {
    const d = err.data as { error?: unknown; code?: unknown }
    if (typeof d.error === 'string' && d.error.trim()) {
      return { message: d.error, code: typeof d.code === 'string' ? d.code : undefined }
    }
  }
  return { message: getAuthErrorMessage(err) || 'We could not add that site. Please try again.' }
}
