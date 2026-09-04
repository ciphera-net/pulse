import { ApiError } from './client'
import { getAuthErrorMessage } from '@ciphera-net/facet'

export interface SiteCreateError {
  /** A human message safe to show — the server's own where there is one. */
  message: string
}

const TRANSIENT_SERVER =
  'Pulse could not save the site just now. Nothing is wrong with the domain; please try again in a moment.'
const TRANSIENT_NETWORK =
  'Pulse could not reach the server. Check your connection and try again.'
const FALLBACK = 'We could not add that site. Please try again.'

/**
 * The site API returns specific, human messages (DOMAIN_INVALID, DOMAIN_TAKEN,
 * DOMAIN_PENDING_DELETION, …). They arrive in ApiError.data, NOT in
 * ApiError.message — the shared client fills `.message` from the HTTP status,
 * so a 409 reads "Something went wrong" and a 403 reads "Invalid credentials"
 * on a form with no credentials on it. Read the server's own message.
 *
 * Two failures are deliberately NOT the server's message, because they say
 * nothing about the domain and the user must know to simply retry: a 5xx (the
 * create failed on our side) and a network failure (no response at all). On the
 * hard-gated setup step there is no skip, so "is my domain wrong, or is Pulse
 * down?" is the difference between retrying and giving up.
 */
export function siteCreateError(err: unknown): SiteCreateError {
  if (err instanceof ApiError) {
    if (err.status >= 500) return { message: TRANSIENT_SERVER }
    if (err.data) {
      const d = err.data as { error?: unknown }
      if (typeof d.error === 'string' && d.error.trim()) return { message: d.error }
    }
    return { message: getAuthErrorMessage(err) || FALLBACK }
  }
  // Thrown before any response (fetch TypeError, aborted) — transient.
  return { message: TRANSIENT_NETWORK }
}
