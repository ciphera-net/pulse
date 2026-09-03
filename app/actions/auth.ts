'use server'

import { cookies } from 'next/headers'
import { logger } from '@/lib/utils/logger'
import { getCookieDomain } from '@/lib/utils/cookies'
import { env } from '@/lib/env'

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
export type AuthExchangeErrorType = 'network' | 'expired' | 'invalid' | 'server'

export async function exchangeAuthCode(code: string, codeVerifier: string | null, redirectUri: string) {
  try {
    // * IMPORTANT: credentials: 'include' is required to receive httpOnly cookies from Auth API
    // * The Auth API sets access_token, refresh_token, and csrf_token as httpOnly cookies
    // * We must forward these to the browser for cross-subdomain auth to work
    const res = await fetch(`${ID_API_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // * Critical: receives httpOnly cookies from Auth API
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
      const errorType: AuthExchangeErrorType =
        status === 401 ? 'expired' : status === 403 ? 'invalid' : 'server'
      return { success: false as const, error: errorType }
    }

    const data: AuthResponse = await res.json()
    if (!data?.access_token || typeof data.access_token !== 'string') {
      throw new Error('Invalid token response')
    }
    // * Decode payload (without verification, we trust the direct channel to Auth Server)
    const payloadPart = data.access_token.split('.')[1]
    if (!payloadPart) {
      throw new Error('Invalid token format')
    }
    const payload: UserPayload = JSON.parse(Buffer.from(payloadPart, 'base64').toString())

    // * Set Cookies
    const cookieStore = await cookies()
    const cookieDomain = getCookieDomain()
    
    // * Access Token
    cookieStore.set('access_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
      maxAge: 60 * 15 // 15 minutes (short lived)
    })

    // * Refresh Token (Long lived)
    cookieStore.set('refresh_token', data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    // * Forward cookies from Auth API response to browser
    // * The Auth API sets httpOnly cookies on id.ciphera.net - we need to mirror them on pulse.ciphera.net
    const setCookieHeaders = res.headers.getSetCookie()
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      for (const cookieStr of setCookieHeaders) {
        // * Parse Set-Cookie header (format: name=value; attributes...)
        const [nameValue] = cookieStr.split(';')
        const eqIdx = nameValue.indexOf('=')
        if (eqIdx === -1) continue
        const name = nameValue.slice(0, eqIdx).trim()
        const value = nameValue.slice(eqIdx + 1).trim()

        if (name === 'access_token' || name === 'refresh_token') continue

        if (name && value) {
          // * Determine if httpOnly (default true for security)
          const isHttpOnly = cookieStr.toLowerCase().includes('httponly')
          // * Determine sameSite (default lax)
          const sameSiteMatch = cookieStr.match(/samesite=(\w+)/i)
          const sameSite = (sameSiteMatch?.[1]?.toLowerCase() as 'strict' | 'lax' | 'none') || 'lax'
          // * Extract max-age if present
          const maxAgeMatch = cookieStr.match(/max-age=(\d+)/i)
          const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 60 * 60 * 24 * 30

          cookieStore.set(name.trim(), decodeURIComponent(value.trim()), {
            httpOnly: isHttpOnly,
            secure: process.env.NODE_ENV === 'production',
            sameSite: sameSite,
            path: '/',
            domain: cookieDomain,
            maxAge: maxAge
          })
        }
      }
    }

    // * Also check for CSRF token in response header (fallback)
    const csrfToken = res.headers.get('X-CSRF-Token')
    if (csrfToken && !cookieStore.get('csrf_token')) {
      cookieStore.set('csrf_token', csrfToken, {
        httpOnly: false, // * Must be readable by JS for CSRF protection
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        domain: cookieDomain,
        maxAge: 60 * 60 * 24 * 30
      })
    }

    return {
      success: true,
      user: {
        id: payload.sub,
        email: payload.email || '',
        totp_enabled: payload.totp_enabled || false,
        org_id: payload.org_id,
        role: payload.role
      }
    }

  } catch (error: unknown) {
    logger.error('Auth Exchange Error:', error)
    const isNetwork =
      error instanceof TypeError ||
      (error instanceof Error && (error.name === 'AbortError' || /fetch|network|ECONNREFUSED|ETIMEDOUT/i.test(error.message)))
    return { success: false as const, error: isNetwork ? 'network' : 'server' }
  }
}

export async function setSessionAction(accessToken: string, refreshToken?: string) {
    try {
        if (!accessToken) throw new Error('Access token is missing')
        
        const payloadPart = accessToken.split('.')[1]
        const payload: UserPayload = JSON.parse(Buffer.from(payloadPart, 'base64').toString())
        
        const cookieStore = await cookies()
        const cookieDomain = getCookieDomain()

        cookieStore.set('access_token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            domain: cookieDomain,
            maxAge: 60 * 15
        })

        // * Only update refresh token if provided
        if (refreshToken) {
            cookieStore.set('refresh_token', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                domain: cookieDomain,
                maxAge: 60 * 60 * 24 * 30
            })
        }
        
        return {
            success: true,
            user: {
                id: payload.sub,
                email: payload.email || '',
                totp_enabled: payload.totp_enabled || false,
                org_id: payload.org_id,
                role: payload.role
            }
        }
    } catch (e) {
        logger.error('[setSessionAction] Error:', e)
        return { success: false as const, error: 'invalid' }
    }
}

/**
 * What one sign-out attempt actually achieved.
 *
 * 🔴 `revoked` is the only honest signal, and it is NOT the same thing as
 * `success`. `success` means the local cookies were cleared — which this action
 * can always do. `revoked` means id-backend answered 2xx, so
 * `RevokeFamilyByPresentedToken` ran and the refresh family is dead in the
 * database. Before 03-09-2026 this action returned a bare `{ success: true }`
 * and the two were silently conflated.
 */
export interface LogoutResult {
  /** The local cookies were cleared. Always true — the user asked to leave. */
  success: boolean
  /** id-backend confirmed the revoke (2xx). The refresh family is dead. */
  revoked: boolean
  /** The upstream HTTP status, or `null` when we never got an answer at all. */
  status: number | null
}

export async function logoutAction(): Promise<LogoutResult> {
  const cookieStore = await cookies()
  const cookieDomain = getCookieDomain()

  // 🔴 ALL THREE COOKIES ARE LOAD-BEARING AND EACH FAILS DIFFERENTLY.
  //
  // This is a SERVER action. There is no browser attached to the outgoing
  // fetch, so `credentials: 'include'` means nothing here — every cookie has to
  // be forwarded by hand on a `Cookie:` header. (`app/api/auth/refresh/route.ts`
  // gets away with a body because /refresh reads `refresh_token` from the body
  // OR the cookie; /logout reads the COOKIE only.)
  //
  //   access_token   AuthMiddleware. Absent ⇒ 401 "Authorization header
  //                  required" and CSRFMiddleware never even runs.
  //   csrf_token     CSRFMiddleware step 1. Absent ⇒ 403 "CSRF token required".
  //   refresh_token  LogoutHandler itself (internal/api/auth.go) reads this
  //                  cookie and ONLY this cookie. Absent ⇒ 200 OK that revokes
  //                  nothing — the worst outcome, because it looks like success.
  const accessToken = cookieStore.get('access_token')?.value
  const refreshToken = cookieStore.get('refresh_token')?.value
  const csrfToken = cookieStore.get('csrf_token')?.value

  let revoked = false
  let status: number | null = null

  // 🔴 THE DEFECT THIS REPLACES (03-09-2026). This used to be a server-side
  // fetch carrying no cookie, no Authorization header and no CSRF header, with
  // `{ refresh_token }` in the body. id-backend's AuthMiddleware answered 401
  // before anything read the body — and the body is ignored by LogoutHandler
  // anyway. So the browser looked signed out while the refresh family stayed
  // live in `refresh_tokens` with `revoked = FALSE` for up to 30 days. Nothing
  // reported it: the response was discarded and the return value was a
  // hardcoded `{ success: true }`.
  //
  // `POST /api/v1/auth/logout` sits on id-backend's `protected` group —
  // AuthMiddleware then CSRFMiddleware (cmd/server/main.go) — and /logout is NOT
  // on CSRFMiddleware's skip list (internal/api/middleware.go: login, refresh,
  // register, /oauth*, verify, authorize-session, forgot-password,
  // reset-password). CSRFMiddleware requires, in order:
  //
  //   1. a `csrf_token` cookie                       ⇒ else 403
  //   2. an `X-CSRF-Token` request header            ⇒ else 403
  //   3. subtle.ConstantTimeCompare(cookie, header)  ⇒ else 403
  //   4. the cookie in `nonce.hmac` form, hmac = HMAC-SHA256(nonce,
  //      JWT_SECRET + userID)                        ⇒ else 403
  if (refreshToken) {
    // Forwarded verbatim. The values are opaque to us and re-encoding one would
    // break the constant-time comparison at step 3 above.
    const cookieHeader = [
      accessToken ? `access_token=${accessToken}` : null,
      `refresh_token=${refreshToken}`,
      csrfToken ? `csrf_token=${csrfToken}` : null,
    ]
      .filter(Boolean)
      .join('; ')

    try {
      const res = await fetch(`${ID_API_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
          // id-backend reads exactly this header name via
          // `c.GetHeader("X-CSRF-Token")` and compares it to the cookie above.
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        // No body. LogoutHandler never reads one — the old `{ refresh_token }`
        // payload was inert, and sending it invited the belief that it worked.
      })
      status = res.status
      revoked = res.ok
      if (!res.ok) {
        // 🔴 Never swallowed. A discarded response is exactly what let this
        // live in production undetected.
        logger.error('[logoutAction] Ciphera ID refused the sign-out; the refresh family was NOT revoked', {
          status: res.status,
        })
      }
    } catch (e) {
      // A throw is a TRANSPORT failure: we never got a verdict, so we know
      // nothing about whether the family was revoked. That is not a success.
      logger.error('[logoutAction] Could not reach Ciphera ID; the refresh family was NOT revoked', e)
    }
  } else {
    // Nothing to revoke and nothing to ask. Report it as unrevoked rather than
    // inventing a 2xx: "there was no session" and "the session survived" must
    // not look the same to the caller.
    logger.warn('[logoutAction] No refresh_token cookie — nothing to revoke upstream')
  }

  // The local cookies go either way: the user asked to leave, and leaving them
  // looking signed in is the worse of the two outcomes.
  //
  // cookies().delete() uses Expires=epoch which is more reliable than
  // maxAge:0 (falsy in JS, some frameworks skip it).
  // ResponseCookies is keyed by name — can only hold one entry per cookie,
  // so we clear on the domain they were set on (.ciphera.net in prod).
  const deleteOpts = { path: '/', domain: cookieDomain } as const
  cookieStore.delete({ name: 'access_token', ...deleteOpts })
  cookieStore.delete({ name: 'refresh_token', ...deleteOpts })
  cookieStore.delete({ name: 'csrf_token', ...deleteOpts })

  return { success: true, revoked, status }
}

export async function getSessionAction() {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')
    
    if (!token) return null

    try {
        const payloadPart = token.value.split('.')[1]
        const payload: UserPayload = JSON.parse(Buffer.from(payloadPart, 'base64').toString())
        return {
            id: payload.sub,
            email: payload.email || '',
            totp_enabled: payload.totp_enabled || false,
            org_id: payload.org_id,
            role: payload.role
        }
    } catch {
        return null
    }
}
