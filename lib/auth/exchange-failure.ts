/**
 * Which screen a failed authorization-code exchange earns.
 *
 * 🔴 A PLAIN MODULE ON PURPOSE. This lived in app/actions/auth.ts, a
 * `'use server'` file — where Next requires every export to be an async Server
 * Action. `tsc` and vitest were both green; `next build` refused it:
 * "Server Actions must be async functions." pulse#552's staging image never
 * built, and only the deploy gate kept that from deploying nothing.
 */

/** Error type returned to the client for mapping to user-facing copy (no sensitive details). */
export type AuthExchangeErrorType = 'network' | 'expired' | 'invalid' | 'server' | 'stale_attempt'
/**
 * Which screen a failed exchange earns. Facet's vocabulary has a type for each.
 *
 * 🔴 THE STATUS ALONE CANNOT DECIDE THIS. id-backend answers 400 for EVERY
 * OAuth-protocol failure — a spent code, an expired one, a redirect_uri or PKCE
 * mismatch, the wrong client — and 401/403 only for two exotic account states
 * (deleted mid-login, operator-disabled). So the body's `error` code is the only
 * signal above 400, and the modal failure in production is `invalid_grant`: a
 * code that was already used, which any retry, double-fire or stale tab produces.
 *
 * That is `stale_attempt` — "This sign-in link has expired… Starting again takes
 * a second" — the same screen a missing pending attempt gets, because it is the
 * same situation: this attempt is done and a fresh one fixes it. `server` is kept
 * for what its copy actually describes: the service did not answer properly.
 */
export function classifyExchangeFailure(status: number, upstreamError: string | null): AuthExchangeErrorType {
  if (status === 401) return 'expired'
  if (status === 403) return 'invalid'
  if (status === 400 && upstreamError && /^(invalid_grant|invalid_client|invalid_request|unsupported_grant_type)$/.test(upstreamError)) {
    return 'stale_attempt'
  }
  return 'server'
}
