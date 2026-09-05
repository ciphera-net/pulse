'use server'

import { cookies, headers } from 'next/headers'
import { logger } from '@/lib/utils/logger'
import { env } from '@/lib/env'
import { clearSession, readSession, writeSession } from '@/lib/auth/session-cookies'
import { endPulseSession } from '@/lib/auth/id-session.server'

// Server-side runtime code. Reads from the Zod-validated env schema.
const ID_API_URL = env.NEXT_PUBLIC_ID_API_URL

interface AuthResponse {
  access_token: string
  refresh_token: string
  id_token: string
  expires_in: number
}

interface UserPayload {
  sub: string
  email?: string
  totp_enabled?: boolean
  org_id?: string
  role?: string
}

/** Error type returned to client for mapping to user-facing copy (no sensitive details). */
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

function decodeUser(accessToken: string): UserPayload {
  const payloadPart = accessToken.split('.')[1]
  if (!payloadPart) throw new Error('Invalid token format')
  // * Decoded without verification: the token came straight from id-backend over
  // * this server's own HTTPS call, or from a cookie only this server writes.
  return JSON.parse(Buffer.from(payloadPart, 'base64').toString())
}

function userOf(payload: UserPayload) {
  return {
    id: payload.sub,
    email: payload.email || '',
    totp_enabled: payload.totp_enabled || false,
    org_id: payload.org_id,
    role: payload.role,
  }
}

async function browserUserAgent(): Promise<string | null> {
  try {
    return (await headers()).get('user-agent')
  } catch {
    return null
  }
}

/**
 * The authorization-code exchange. Per-app sessions S3: the tokens go into
 * Pulse's OWN host-only cookies (lib/auth/session-cookies.ts) and the access
 * token is also returned to the browser, which holds it in memory and sends it
 * to pulse-api as a Bearer — the cookie would never reach that host.
 *
 * 🔴 id-backend's /oauth/token ALSO answers with Set-Cookie for the apex trio
 * (`access_token`, `refresh_token`, `csrf_token` on Domain=ciphera.net), even
 * on a server-to-server call. Until S3 this action MIRRORED them onto
 * `.ciphera.net` — Pulse re-writing the estate's session on every login. They
 * are discarded now: the body carries the tokens, the `X-CSRF-Token` HEADER
 * carries the CSRF value, and nothing this action writes has a domain.
 *
 * The browser's User-Agent is forwarded because id-backend binds the refresh
 * token to its UA class at mint and re-checks it at every rotation; the
 * refresh route forwards the same header, so the two agree.
 */
export async function exchangeAuthCode(code: string, codeVerifier: string | null, redirectUri: string) {
  try {
    const userAgent = await browserUserAgent()
    const res = await fetch(`${ID_API_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
      },
      cache: 'no-store',
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: 'pulse-app',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier || '',
      }),
    })

    if (!res.ok) {
      const status = res.status
      // * The body was discarded here until 05-09-2026, which left every 400 —
      // * the modal failure — indistinguishable from a 5xx. See classifyExchangeFailure.
      let upstreamError: string | null = null
      try {
        const body = (await res.json()) as { error?: unknown }
        if (typeof body?.error === 'string' && body.error.length <= 64) upstreamError = body.error
      } catch { /* no body, or not JSON — the status still decides */ }
      return {
        success: false as const,
        error: classifyExchangeFailure(status, upstreamError),
        // * For telemetry only — the raw code is what makes a misconfigured
        // * redirect_uri distinguishable from a spent code after the fact.
        upstream: upstreamError ?? `http_${status}`,
      }
    }

    const data: AuthResponse = await res.json()
    if (!data?.access_token || typeof data.access_token !== 'string') {
      throw new Error('Invalid token response')
    }
    if (!data.refresh_token || typeof data.refresh_token !== 'string') {
      throw new Error('Token response carried no refresh token')
    }
    const payload = decodeUser(data.access_token)

    const cookieStore = await cookies()
    writeSession(cookieStore, {
      access: data.access_token,
      refresh: data.refresh_token,
      csrf: res.headers.get('X-CSRF-Token'),
    })

    return {
      success: true as const,
      user: userOf(payload),
      // * For the browser's in-memory Bearer — see lib/api/client.ts.
      access_token: data.access_token,
    }
  } catch (error: unknown) {
    logger.error('Auth Exchange Error:', error)
    const isNetwork =
      error instanceof TypeError ||
      (error instanceof Error && (error.name === 'AbortError' || /fetch|network|ECONNREFUSED|ETIMEDOUT/i.test(error.message)))
    return { success: false as const, error: isNetwork ? 'network' : 'server' }
  }
}

/**
 * Stores a token the browser obtained itself (the organization switch): the
 * browser also keeps it in memory, so the two copies always agree.
 */
export async function setSessionAction(accessToken: string, refreshToken?: string) {
  try {
    if (!accessToken) throw new Error('Access token is missing')
    const payload = decodeUser(accessToken)

    const cookieStore = await cookies()
    writeSession(cookieStore, { access: accessToken, refresh: refreshToken || null })

    return { success: true as const, user: userOf(payload), access_token: accessToken }
  } catch (e) {
    logger.error('[setSessionAction] Error:', e)
    return { success: false as const, error: 'invalid' as const }
  }
}

/**
 * Signs out of PULSE — its own family at id-backend, its own cookies here.
 * id.ciphera.net's ceremony session and every other app are left alone.
 *
 * Until S3 this posted `{refresh_token}` in a body id-backend never reads
 * (design §2) and reported success regardless: no Pulse sign-out had ever
 * revoked anything. The revocation is now real (lib/auth/id-session.server.ts)
 * and the answer says what id-backend confirmed. The cookies are expired
 * whatever the answer — a person who asked to leave must not be left looking
 * signed in.
 */
export async function logoutAction() {
  const cookieStore = await cookies()
  const session = readSession(cookieStore)
  const userAgent = await browserUserAgent()

  let revoked = false
  let status: number | null = null
  let alreadyInvalid = false
  if (session.refresh) {
    const outcome = await endPulseSession(session, userAgent)
    revoked = outcome.revoked
    status = outcome.status
    alreadyInvalid = outcome.alreadyInvalid
    if (!revoked && !alreadyInvalid) {
      logger.warn('[logoutAction] id-backend did not confirm the revocation', { status })
    }
  }

  clearSession(cookieStore)
  return { success: true as const, revoked, status, already_invalid: alreadyInvalid }
}

/**
 * The session as this server sees it — from Pulse's own access cookie — plus
 * the token itself, so the browser can re-prime its in-memory Bearer on load.
 */
export async function getSessionAction() {
  const cookieStore = await cookies()
  const { access } = readSession(cookieStore)
  if (!access) return null

  try {
    const payload = decodeUser(access)
    return { ...userOf(payload), access_token: access }
  } catch {
    return null
  }
}
