'use server'

import { cookies } from 'next/headers'
import { logger } from '@/lib/utils/logger'
import { getCookieDomain } from '@/lib/utils/cookies'

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8081'

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
    const res = await fetch(`${AUTH_API_URL}/oauth/token`, {
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
      let body = ''
      try { body = await res.text() } catch {}
      logger.error('Auth token exchange failed', { status, body, url: `${AUTH_API_URL}/oauth/token`, redirectUri })
      const errorType: AuthExchangeErrorType =
        status === 401 ? 'expired' : status === 403 ? 'invalid' : 'server'
      return { success: false as const, error: errorType, status, detail: body, debug: { url: `${AUTH_API_URL}/oauth/token`, redirect_uri: redirectUri, code: code.slice(0, 8) + '...' } }
    }

    let data: AuthResponse
    try {
      data = await res.json()
    } catch (e) {
      logger.error('Auth exchange: failed to parse response JSON', e)
      return { success: false as const, error: 'server' as AuthExchangeErrorType, status: 200, detail: 'json_parse_failed' }
    }
    if (!data?.access_token || typeof data.access_token !== 'string') {
      logger.error('Auth exchange: missing access_token in response', { keys: Object.keys(data || {}) })
      return { success: false as const, error: 'server' as AuthExchangeErrorType, status: 200, detail: 'missing_access_token' }
    }
    // * Decode payload (without verification, we trust the direct channel to Auth Server)
    const payloadPart = data.access_token.split('.')[1]
    if (!payloadPart) {
      logger.error('Auth exchange: invalid token format')
      return { success: false as const, error: 'server' as AuthExchangeErrorType, status: 200, detail: 'invalid_token_format' }
    }
    let payload: UserPayload
    try {
      payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString())
    } catch (e) {
      logger.error('Auth exchange: failed to decode JWT payload', e)
      return { success: false as const, error: 'server' as AuthExchangeErrorType, status: 200, detail: 'jwt_decode_failed' }
    }

    // * Set Cookies
    let cookieStore: Awaited<ReturnType<typeof cookies>>
    try {
      cookieStore = await cookies()
    } catch (e) {
      logger.error('Auth exchange: failed to access cookie store', e)
      return { success: false as const, error: 'server' as AuthExchangeErrorType, status: 200, detail: 'cookie_store_failed' }
    }
    const cookieDomain = getCookieDomain()
    
    try {
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
    } catch (e) {
      logger.error('Auth exchange: failed to set auth cookies', e)
      return { success: false as const, error: 'server' as AuthExchangeErrorType, status: 200, detail: 'cookie_set_failed' }
    }

    // * Forward cookies from Auth API response to browser
    try {
      const setCookieHeaders = res.headers.getSetCookie()
      if (setCookieHeaders && setCookieHeaders.length > 0) {
        for (const cookieStr of setCookieHeaders) {
          const [nameValue] = cookieStr.split(';')
          const [name, value] = nameValue.trim().split('=')

          if (name && value) {
            const isHttpOnly = cookieStr.toLowerCase().includes('httponly')
            const sameSiteMatch = cookieStr.match(/samesite=(\w+)/i)
            const sameSite = (sameSiteMatch?.[1]?.toLowerCase() as 'strict' | 'lax' | 'none') || 'lax'
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
    } catch (e) {
      logger.error('Auth exchange: failed to forward Set-Cookie headers', e)
      // * Non-fatal — auth cookies are already set above
    }

    // * Also check for CSRF token in response header (fallback)
    try {
      const csrfToken = res.headers.get('X-CSRF-Token')
      if (csrfToken && !cookieStore.get('csrf_token')) {
        cookieStore.set('csrf_token', csrfToken, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          domain: cookieDomain,
          maxAge: 60 * 60 * 24 * 30
        })
      }
    } catch (e) {
      logger.error('Auth exchange: failed to set CSRF cookie', e)
      // * Non-fatal
    }

    return {
      success: true,
      user: {
        id: payload.sub,
        email: payload.email || 'user@ciphera.net',
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
                email: payload.email || 'user@ciphera.net',
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

export async function logoutAction() {
  const cookieStore = await cookies()
  const cookieDomain = getCookieDomain()
  
  cookieStore.set('access_token', '', { 
    maxAge: 0, 
    path: '/', 
    domain: cookieDomain 
  })
  cookieStore.set('refresh_token', '', { 
    maxAge: 0, 
    path: '/', 
    domain: cookieDomain 
  })
  return { success: true }
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
            email: payload.email || 'user@ciphera.net',
            totp_enabled: payload.totp_enabled || false,
            org_id: payload.org_id,
            role: payload.role
        }
    } catch {
        return null
    }
}
