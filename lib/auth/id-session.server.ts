import { env } from '@/lib/env'
import type { SessionCookies } from '@/lib/auth/session-cookies'

/**
 * Pulse's calls to id-backend on behalf of its OWN session — the sign-out, and
 * the renewal a sign-out sometimes needs first. Server-side only.
 *
 * 🔴 EVERY REQUEST HERE BUILDS ITS HEADERS BY HAND AND FORWARDS NO BROWSER
 * COOKIE. id-backend's refresh handler reads a `refresh_token` COOKIE before
 * the JSON body, and its logout handler reads the cookie ONLY. The browser
 * still holds the ceremony's apex `refresh_token` until S5; forwarding its
 * Cookie header would present THAT token — rotating, or revoking, the
 * ceremony's family in Pulse's name. So the Cookie header a call needs is
 * composed from Pulse's own values, and nothing else.
 *
 * 🔴 WHY THE SIGN-OUT LOOKS LIKE THIS. Until S3 `logoutAction` posted
 * `{refresh_token}` in a JSON body that id-backend's LogoutHandler never reads
 * (design §2): every Pulse sign-out since the beginning revoked nothing, and
 * the family lived on for 30 days behind a login page. The route sits behind
 * AuthMiddleware + CSRFMiddleware and is not on the CSRF skip list, so one
 * request must carry the Bearer, a Cookie with `refresh_token` AND `csrf_token`,
 * and a matching `X-CSRF-Token`. When the access token has already expired
 * (a laptop that slept 20 minutes, then "Sign out") the first attempt is
 * refused; renewing from the refresh token and retrying once with the rotated
 * credentials is what makes "the access token is already gone" a first-class
 * case instead of a 401 walked into (design §9). This is Warden's shape
 * (§10.10.2), ported.
 *
 * The browser's User-Agent is forwarded: id-backend binds the refresh token to
 * its UA class at mint and re-checks it at every rotation.
 */

const ID_API_URL = env.NEXT_PUBLIC_ID_API_URL
const UPSTREAM_TIMEOUT_MS = 10_000

function headers(userAgent: string | null, extra: Record<string, string>): Headers {
  const h = new Headers({ accept: 'application/json', 'content-type': 'application/json', ...extra })
  if (userAgent) h.set('user-agent', userAgent)
  return h
}

async function post(url: string, h: Headers, body: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: h,
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

export interface RenewalOutcome {
  kind: 'renewed' | 'refused' | 'transient'
  access?: string
  /** Present only when id-backend rotated. Never write back an echoed token. */
  refresh?: string | null
  csrf?: string | null
  status: number | null
}

/**
 * Renews Pulse's own session with the refresh token in the BODY. A 200 without
 * `rotated: true` is the benign-reuse / lost-race answer: a fresh access token
 * and NO new refresh token — the caller that won already holds the live one,
 * and writing anything else back is the 20-08 incident.
 */
export async function renewAtId(args: {
  refreshToken: string
  userAgent: string | null
}): Promise<RenewalOutcome> {
  const res = await post(
    `${ID_API_URL}/api/v1/auth/refresh`,
    headers(args.userAgent, {}),
    JSON.stringify({ refresh_token: args.refreshToken }),
  )
  if (!res) return { kind: 'transient', status: null }
  const data: { access_token?: unknown; refresh_token?: unknown; rotated?: unknown } | null = await res.json().catch(() => null)
  if (res.status === 401) return { kind: 'refused', status: 401 }
  if (!res.ok || typeof data?.access_token !== 'string' || !data.access_token) {
    return { kind: 'transient', status: res.status }
  }
  const rotated = data.rotated === true && typeof data.refresh_token === 'string' && data.refresh_token !== ''
  return {
    kind: 'renewed',
    access: data.access_token,
    refresh: rotated ? (data.refresh_token as string) : null,
    csrf: res.headers.get('x-csrf-token'),
    status: res.status,
  }
}

async function revokeAtId(args: {
  accessToken: string
  refreshToken: string
  csrfToken: string
  userAgent: string | null
}): Promise<number | null> {
  const res = await post(
    `${ID_API_URL}/api/v1/auth/logout`,
    headers(args.userAgent, {
      authorization: `Bearer ${args.accessToken}`,
      cookie: `refresh_token=${args.refreshToken}; csrf_token=${args.csrfToken}`,
      'x-csrf-token': args.csrfToken,
    }),
    '{}',
  )
  return res ? res.status : null
}

export interface LogoutOutcome {
  /** True only when id-backend answered 2xx to the revocation. */
  revoked: boolean
  /** The last status id-backend gave, or null if it was never reached. */
  status: number | null
  /** The credential was already dead server-side — nothing left to revoke. */
  alreadyInvalid: boolean
  /** What the renewal produced, so the caller can persist rotated cookies even when the revoke then failed. */
  renewed: RenewalOutcome | null
}

const ok = (status: number | null) => status !== null && status >= 200 && status < 300

/**
 * Ends Pulse's own family at id-backend. Revocation is family-scoped there,
 * and since S2 Pulse's family is its own — this signs the user out of Pulse
 * and leaves id.ciphera.net's ceremony session, and every other app, alone.
 */
export async function endPulseSession(session: SessionCookies, userAgent: string | null): Promise<LogoutOutcome> {
  if (!session.refresh) return { revoked: false, status: null, alreadyInvalid: false, renewed: null }

  let access = session.access
  let refresh = session.refresh
  let csrf = session.csrf

  if (access && csrf) {
    const first = await revokeAtId({ accessToken: access, refreshToken: refresh, csrfToken: csrf, userAgent })
    if (ok(first)) return { revoked: true, status: first, alreadyInvalid: false, renewed: null }
    // 401 = the access token expired; 403 = the CSRF pair was refused. Both
    // are answered by renewing. Anything else is not something a retry fixes.
    if (first !== null && first !== 401 && first !== 403) {
      return { revoked: false, status: first, alreadyInvalid: false, renewed: null }
    }
  }

  const renewal = await renewAtId({ refreshToken: refresh, userAgent })
  if (renewal.kind === 'refused') {
    return { revoked: false, status: 401, alreadyInvalid: true, renewed: null }
  }
  if (renewal.kind === 'transient') {
    return { revoked: false, status: renewal.status, alreadyInvalid: false, renewed: null }
  }
  access = renewal.access ?? access
  if (renewal.refresh) refresh = renewal.refresh
  if (renewal.csrf) csrf = renewal.csrf
  if (!access || !csrf) return { revoked: false, status: null, alreadyInvalid: false, renewed: renewal }

  const second = await revokeAtId({ accessToken: access, refreshToken: refresh, csrfToken: csrf, userAgent })
  return { revoked: ok(second), status: second, alreadyInvalid: false, renewed: renewal }
}
