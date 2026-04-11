import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCookieDomain } from '@/lib/utils/cookies'

// This runs server-side at runtime. It reads the same NEXT_PUBLIC_* values
// the client bundle inlined at build time — Next.js makes them available in
// both phases. No localhost fallback: if the var is missing we want a loud
// failure, not a silent connection to a dev-only URL.
const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL
if (!AUTH_API_URL) {
  throw new Error('NEXT_PUBLIC_AUTH_API_URL is not set. See .env.example.')
}

export async function POST() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  // * Read org_id from existing access token (if still present) before refreshing
  let previousOrgId: string | null = null
  const existingToken = cookieStore.get('access_token')?.value
  if (existingToken) {
    try {
      const payload = JSON.parse(Buffer.from(existingToken.split('.')[1], 'base64').toString())
      previousOrgId = payload.org_id || null
    } catch { /* token may be malformed, proceed without org */ }
  }

  try {
    // * Step 1: Refresh the base token
    const res = await fetch(`${AUTH_API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    const cookieDomain = getCookieDomain()

    if (!res.ok) {
        // * If refresh fails, clear cookies
        cookieStore.set('access_token', '', { maxAge: 0, path: '/', domain: cookieDomain })
        cookieStore.set('refresh_token', '', { maxAge: 0, path: '/', domain: cookieDomain })
        return NextResponse.json({ error: 'Refresh failed' }, { status: 401 })
    }

    const data = await res.json()
    let finalAccessToken = data.access_token

    // * Get CSRF token from Auth API refresh response (needed for switch-context call)
    const csrfToken = res.headers.get('X-CSRF-Token')
    // * Also check for CSRF token in the cookie store (browser may have sent it)
    const csrfFromCookie = cookieStore.get('csrf_token')?.value
    const csrfForRequests = csrfToken || csrfFromCookie || ''

    // * Step 2: Restore organization context
    // * The auth service's refresh endpoint returns a "base" token without org_id.
    // * We need to call switch-context to get an org-scoped token so that
    // * Pulse API requests don't fail with 403 after a mid-session refresh.
    let orgId = previousOrgId

    if (!orgId) {
      // * No org_id from old token — look up user's organizations
      try {
        const orgsRes = await fetch(`${AUTH_API_URL}/api/v1/auth/organizations`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${finalAccessToken}`,
          },
        })
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json()
          if (orgsData.organizations?.length > 0) {
            orgId = orgsData.organizations[0].organization_id
          }
        }
      } catch { /* proceed with base token */ }
    }

    if (orgId) {
      try {
        const switchRes = await fetch(`${AUTH_API_URL}/api/v1/auth/switch-context`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${finalAccessToken}`,
            'X-CSRF-Token': csrfForRequests,
            'Cookie': `csrf_token=${csrfForRequests}`,
          },
          body: JSON.stringify({ organization_id: orgId }),
        })
        if (switchRes.ok) {
          const switchData = await switchRes.json()
          finalAccessToken = switchData.access_token
        }
      } catch { /* proceed with base token */ }
    }

    cookieStore.set('access_token', finalAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
      maxAge: 60 * 15
    })

    cookieStore.set('refresh_token', data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
      maxAge: 60 * 60 * 24 * 30
    })

    // * Set/update CSRF token cookie (non-httpOnly, for JS access)
    if (csrfToken) {
      cookieStore.set('csrf_token', csrfToken, {
        httpOnly: false, // * Must be readable by JS for CSRF protection
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        domain: cookieDomain,
        maxAge: 60 * 60 * 24 * 30
      })
    }

    return NextResponse.json({ success: true, access_token: finalAccessToken })
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
