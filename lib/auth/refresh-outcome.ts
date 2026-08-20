/**
 * ═══ WAS THAT A VERDICT, OR DID WE JUST NOT GET AN ANSWER? ═══
 *
 * A failed token refresh means one of two completely different things:
 *
 *   DEFINITIVE — the server looked at the credential and rejected it. The
 *                session is over. Say so.
 *   TRANSIENT  — we never reached a server that could judge it. The network was
 *                down, a pod was mid-rollout, an edge returned 502, the laptop
 *                was still waking up. The session may be perfectly valid.
 *
 * 🔴 Treating the second as the first is why "Session expired" appeared on every
 * blip: three attempts failed inside four seconds and the modal went up on a
 * session nobody had rejected. A session we could not verify is not a session we
 * may throw away.
 *
 * Audit: Infra/Auth/docs/audits/20-08-2026-session-loss-root-cause-audit.md §4 F-D, F-G
 */

/** The shape `/api/auth/refresh` returns on failure. Fields are best-effort. */
export interface RefreshFailureBody {
  transient?: boolean
  retryable?: boolean
  error?: string
}

/**
 * Decide whether a failed refresh was transient.
 *
 * The route classifies this for us and says so in the body — that is the
 * authoritative answer, because only the route knows what id-backend replied.
 * The status fallback exists for the case where the body carries no verdict at
 * all, which is precisely the dangerous one: a 502 from Traefik or the CDN never
 * reaches our route, so there is no `transient` field to read and the raw status
 * is all we have.
 */
export function isTransientRefreshFailure(
  status: number,
  body: RefreshFailureBody | null | undefined,
): boolean {
  if (body && typeof body.transient === 'boolean') return body.transient

  // 401 — the credential itself was rejected. The only definitive answer.
  if (status === 401) return false
  // 403 — about the organization context, not the credential. The caller has
  // already taken its one retry by the time we get here, so ending the session
  // is the honest outcome rather than looping.
  if (status === 403) return false

  // Everything else reached no verdict: 5xx, 429, 408, and status 0 from a
  // request that never completed.
  return true
}
