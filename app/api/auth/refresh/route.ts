import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { clearAccess, clearSession, readSession, writeSession } from '@/lib/auth/session-cookies'

// Server-side runtime code. Reads from the same Zod-validated env schema
// the client bundle imports — both phases see identical values, and Zod
// throws at module load on any missing/malformed input.
const ID_API_URL = env.NEXT_PUBLIC_ID_API_URL

/**
 * Renews Pulse's OWN session (per-app sessions S3).
 *
 * The refresh token lives in the httpOnly, host-only `pulse_refresh` cookie
 * that only this origin's server can read, and travels to id-backend in the
 * JSON BODY. 🔴 No Cookie header is forwarded, and this matters more than it
 * did before S3: id-backend's handler reads a `refresh_token` COOKIE before the
 * body, and the browser still holds the ceremony's apex `refresh_token` until
 * S5 — forwarding it would rotate the ceremony's family in Pulse's name.
 *
 * The new access token goes back to the browser in the body, where the auth
 * context holds it in memory as the Bearer for pulse-api. Nothing this route
 * writes has a `Domain` attribute, and nothing it deletes is an apex cookie.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies()
  const session = readSession(cookieStore)
  const refreshToken = session.refresh

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  let body: { screen_width?: number; screen_height?: number; timezone?: string; org_id?: string } = {}
  try {
    body = await request.json()
  } catch { /* no body or invalid JSON — device signals will be omitted */ }

  // * Preserve whatever organization the user is currently scoped to so the
  // * rotated token keeps that context. Prefers the access cookie (still
  // * valid), then falls back to the client-supplied org_id from localStorage
  // * (survives cookie expiry). Without either, the auth backend embeds the
  // * user's primary org automatically.
  let previousOrgId = ''
  if (session.access) {
    try {
      const payload = JSON.parse(Buffer.from(session.access.split('.')[1], 'base64').toString())
      if (typeof payload.org_id === 'string') previousOrgId = payload.org_id
    } catch { /* token may be malformed, proceed without org */ }
  }
  if (!previousOrgId && body.org_id) {
    previousOrgId = body.org_id
  }

  try {
    const deviceSignals = body.screen_width ? {
      screen_width: body.screen_width,
      screen_height: body.screen_height,
      timezone: body.timezone,
    } : {}

    const doRefresh = async (orgId: string) => {
      return fetch(`${ID_API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': request.headers.get('user-agent') || '',
        },
        cache: 'no-store',
        body: JSON.stringify({
          refresh_token: refreshToken,
          ...(orgId ? { organization_id: orgId } : {}),
          ...deviceSignals,
        }),
      })
    }

    let res = await doRefresh(previousOrgId)

    // If the org context is stale (user removed or org deleted), retry without
    // it so the server falls back to the user's primary org.
    if (res.status === 403 && previousOrgId) {
      const errBody = await res.json().catch(() => null)
      if (errBody?.error?.includes('not a member')) {
        res = await doRefresh('')
      }
    }

    if (!res.ok) {
      const upstream = await res.json().catch(() => ({ error: 'Unknown' }))
      const reason = upstream?.error || 'Refresh failed'

      // * ═══ ONLY A VERDICT MAY DESTROY THE SESSION ═══
      // *
      // * 🔴 This block used to delete the access cookie on ANY non-OK status, and
      // * the refresh cookie too unless the status was exactly 403. So a 500, a 502
      // * while id-backend rolled, or a gateway blip permanently destroyed a
      // * session that was never invalid — the user was signed out by an
      // * infrastructure hiccup. That is very likely the origin of "I get logged
      // * out when we deploy".
      // *
      // * A 401 is the ONLY answer that means "this credential is dead". A 403 is
      // * about the organization context, not the credential. Everything else —
      // * 5xx, 429, 408, a malformed reply — means we never got an answer at all,
      // * and a session we could not verify is not a session we may throw away.
      // * Audit: Infra/Auth/docs/audits/20-08-2026-session-loss-root-cause-audit.md §4 F-D
      const credentialRejected = res.status === 401
      const orgContextRejected = res.status === 403
      const transient = !credentialRejected && !orgContextRejected

      if (credentialRejected) {
        clearSession(cookieStore)
      } else if (orgContextRejected) {
        // * Drop only the access token so the client's retry falls back to the
        // * org_id it carries in its body. The refresh token is still good.
        clearAccess(cookieStore)
      }
      // * transient → touch nothing. The cookies are the only copy of the session.

      return NextResponse.json(
        { error: reason, retryable: orgContextRejected, transient },
        { status: res.status },
      )
    }

    const data = await res.json()
    const csrfToken = res.headers.get('X-CSRF-Token')

    // * ═══ ONLY STORE A REFRESH TOKEN THE SERVER ACTUALLY ROTATED TO ═══
    // *
    // * id-backend answers a refresh in one of TWO ways, both with 200 OK:
    // *   1. It rotated  → `refresh_token` is a NEW token. Store it.
    // *   2. It did NOT  → `refresh_token` is the token we just sent BACK to us,
    // *                    or absent altogether (the current handler omits it).
    // *
    // * (2) is the "benign reuse" grace path (id-backend internal/api/refresh.go).
    // * It fires when two things refresh the same cookie at once: the first call
    // * rotates T1→T2, the second still holds T1, and rather than fail it the
    // * server mints a fresh access token and echoes T1 — a courtesy for the
    // * multi-tab race. But T1 IS ALREADY REVOKED.
    // *
    // * 🔴 Writing that echo into the cookie rolls the session back from the live
    // * T2 to the dead T1, and does it behind a 200. The token keeps working for
    // * `ReuseGracePeriod` (60s), so nothing looks wrong — and then the NEXT
    // * refresh, up to 13 minutes later, presents a revoked token outside its
    // * grace window, which id-backend correctly classifies as token theft and
    // * answers with a family revocation. Measured 20-08-2026 — 38 account-wide
    // * revocations in 10 days, no audit trail, and the timing gap is why it read
    // * as "random".
    // *
    // * The guard is the inequality. On the grace path we simply leave the cookie
    // * alone: the winning caller's Set-Cookie already put the live T2 in the jar,
    // * so "don't touch it" is exactly right. There is no case where re-storing a
    // * token we ourselves just sent is the correct outcome.
    const rotated = Boolean(data.refresh_token) && data.refresh_token !== refreshToken

    writeSession(cookieStore, {
      access: data.access_token,
      refresh: rotated ? data.refresh_token : null,
      csrf: csrfToken,
    })

    return NextResponse.json({ success: true, access_token: data.access_token })
  } catch {
    // * We never reached id-backend, so we learned nothing about the session.
    // * Report it as transient and leave the cookies alone.
    return NextResponse.json({ error: 'Internal error', transient: true }, { status: 500 })
  }
}
