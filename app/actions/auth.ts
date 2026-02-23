'use server'

import { cookies } from 'next/headers'
import { logger } from '@/lib/utils/logger'

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8081'

// * Determine cookie domain dynamically
// * In production (on ciphera.net), we want to share cookies with subdomains (e.g. pulse-api.ciphera.net)
// * In local dev (localhost), we don't set a domain
const getCookieDomain = () => {
  if (process.env.NODE_ENV === 'production') {
    return '.ciphera.net'
  }
  return undefined
}

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
    const res = await fetch(`${AUTH_API_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
