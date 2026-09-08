import { ApiError } from './client'
import { getAuthErrorMessage } from '@ciphera-net/facet'

export interface OrgCreateError {
  /** A human message safe to show — the server's own where there is one. */
  message: string
}

const TRANSIENT_SERVER =
  'Pulse could not create the workspace just now. Nothing is wrong with the name; please try again in a moment.'
const TRANSIENT_NETWORK =
  'Pulse could not reach the server. Check your connection and try again.'
const FALLBACK = 'We could not create that workspace. Please try again.'

/**
 * The same fix the site step got on 05-09-2026, applied to the step beside it.
 *
 * 🔴 THE ORG API'S MESSAGES ARRIVE IN `ApiError.data`, NOT `.message`. The
 * shared client fills `.message` from the HTTP status, so ciphera-id's
 * guaranteed rejections — a name under three characters, a slug already taken —
 * came out as "Something went wrong, please try again." The one thing the
 * person needed to know (change the name) was the one thing not said, on a
 * screen whose only control is that name.
 *
 * Two failures are deliberately NOT the server's message, because they say
 * nothing about the name and the person must know to simply retry: a 5xx, and
 * a network failure with no response at all.
 *
 * ⚠️ Kept separate from siteCreateError rather than generalised: the two carry
 * different transient copy ("nothing is wrong with the domain" vs "with the
 * name"), which is the whole point of them — a shared version would have to
 * drop the specificity or take the noun as an argument, and a caller that
 * passes the wrong noun is worse than two short files.
 */
export function orgCreateError(err: unknown): OrgCreateError {
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
