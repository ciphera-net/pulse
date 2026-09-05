// * Pending OAuth attempts, keyed by the `state` the authorization server echoes back.
// *
// * This used to be two fixed localStorage keys — `oauth_state` and
// * `oauth_code_verifier` — which made an in-flight sign-in a single mutable slot
// * shared by every tab. Starting a second attempt (a second /login mount, a CTA
// * on the marketing header, another tab) overwrote the first, and completing the
// * earlier authorization then failed state validation. localStorage is shared
// * across tabs, so this was a race, not an edge case.
// *
// * Each attempt now gets its own entry. The callback looks its entry up by the
// * state it was handed, so concurrent and abandoned attempts all resolve
// * correctly and one can never clobber another.

const PENDING_PREFIX = 'oauth_pending:'

// * The dead single-slot format. Nothing writes these any more; they are removed
// * on sight so a browser that carries them over a deploy doesn't keep them forever.
const LEGACY_KEYS = ['oauth_state', 'oauth_code_verifier'] as const

/**
 * How long an unfinished attempt stays usable. Long enough to cover a real
 * sign-in (including an account chooser, a password manager and a TOTP prompt),
 * short enough that an abandoned attempt cannot be completed much later.
 */
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000

export interface PendingAuthAttempt {
  /** The PKCE code verifier for this attempt. */
  verifier: string
  /** Epoch ms the attempt started — the only expiry input. */
  createdAt: number
  /**
   * The EXACT `redirect_uri` string sent to the authorization server for this
   * attempt, so the token exchange can send the same bytes back.
   *
   * 🔴 id-backend compares `authCode.RedirectURI != req.RedirectURI` with Go's
   * `!=` — no trailing-slash normalisation, no scheme coercion — and answers
   * `400 invalid_grant` on any difference. Pulse used to compute the value
   * twice: a build-time `APP_URL` at authorize, `window.location.origin` at
   * exchange. Two computations that must agree byte-for-byte will eventually
   * not, and the failure renders as "This sign-in link has expired", which is
   * a configuration error wearing a spent code's clothes.
   *
   * Optional only for an attempt written before this shipped; see
   * `LEGACY_AUTHORIZE_REDIRECT_URI` at the callback.
   */
  redirectUri?: string
}

// * localStorage throws in private browsing and when storage is disabled. Every
// * access goes through here so a storage failure degrades to "no pending
// * attempt" (a visible error at the callback) rather than an exception.
function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function keyFor(state: string): string {
  return `${PENDING_PREFIX}${state}`
}

function parseEntry(raw: string | null): PendingAuthAttempt | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const { verifier, createdAt, redirectUri } = parsed as Partial<PendingAuthAttempt>
    // * A malformed entry is treated as absent, never as a permissive default.
    if (typeof verifier !== 'string' || verifier.length === 0) return null
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
    // * An entry from before redirectUri was stored parses fine and reports the
    // * field as absent — the caller decides what that means. A present-but-wrong
    // * type is treated as absent rather than passed through.
    const uri = typeof redirectUri === 'string' && redirectUri.length > 0 ? redirectUri : undefined
    return uri ? { verifier, createdAt, redirectUri: uri } : { verifier, createdAt }
  } catch {
    return null
  }
}

function isExpired(entry: PendingAuthAttempt, now: number): boolean {
  // * A createdAt in the future means a clock change or a tampered entry; treat
  // * it as unusable rather than trusting it for another ten minutes.
  const age = now - entry.createdAt
  return age > PENDING_MAX_AGE_MS || age < 0
}

function pendingKeys(store: Storage): string[] {
  // * Snapshot the keys before removing anything — mutating localStorage while
  // * walking its index shifts it and silently skips entries.
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key && key.startsWith(PENDING_PREFIX)) keys.push(key)
  }
  return keys
}

/**
 * Drop attempts that are past `PENDING_MAX_AGE_MS`, plus any unparseable entry
 * and the dead single-slot keys.
 *
 * Expiry is by AGE and nothing else. The previous cleanup deleted the in-flight
 * keys on any route that wasn't the callback, which meant visiting any page
 * mid-flow silently disarmed state validation at the callback.
 */
export function prunePendingAuth(now: number = Date.now()): void {
  const store = storage()
  if (!store) return
  try {
    for (const key of LEGACY_KEYS) store.removeItem(key)
    for (const key of pendingKeys(store)) {
      const entry = parseEntry(store.getItem(key))
      if (!entry || isExpired(entry, now)) store.removeItem(key)
    }
  } catch {
    // * Storage unavailable mid-walk — nothing to clean up.
  }
}

/** Record an attempt so the callback can find its verifier AND its redirect_uri by `state`. */
export function rememberPendingAuth(
  state: string,
  verifier: string,
  redirectUri: string,
  now: number = Date.now()
): void {
  const store = storage()
  if (!store || !state) return
  // * Bound growth: abandoned attempts are collected as new ones are started.
  prunePendingAuth(now)
  try {
    const entry: PendingAuthAttempt = { verifier, createdAt: now, redirectUri }
    store.setItem(keyFor(state), JSON.stringify(entry))
  } catch {
    // * Quota or disabled storage. The callback will report a stale attempt
    // * rather than exchanging a code it cannot bind to a verifier.
  }
}

/**
 * Look up the attempt for `state` and consume it.
 *
 * Returns `null` for an unknown, forged, expired or malformed state — all of
 * which the caller must treat as a real error. A single-use claim also means a
 * replayed callback URL cannot be exchanged twice.
 */
export function claimPendingAuth(
  state: string,
  now: number = Date.now()
): PendingAuthAttempt | null {
  const store = storage()
  if (!store || !state) return null
  try {
    const key = keyFor(state)
    const entry = parseEntry(store.getItem(key))
    // * Remove on claim whether or not it was still valid — an attempt that has
    // * been answered once is spent either way.
    store.removeItem(key)
    // * Opportunistically collect the other abandoned attempts from this journey.
    prunePendingAuth(now)
    if (!entry || isExpired(entry, now)) return null
    return entry
  } catch {
    return null
  }
}

/**
 * Drop every pending attempt. For logout and for restarting a failed sign-in,
 * where any attempt still on the device is known to be abandoned.
 */
export function forgetAllPendingAuth(): void {
  const store = storage()
  if (!store) return
  try {
    for (const key of LEGACY_KEYS) store.removeItem(key)
    for (const key of pendingKeys(store)) store.removeItem(key)
  } catch {
    // * Storage unavailable — nothing to forget.
  }
}
