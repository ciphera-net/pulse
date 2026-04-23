import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCookieDomain } from '@/lib/utils/cookies'
import { env } from '@/lib/env'

// Server-side runtime code. Reads from the same Zod-validated env schema
// the client bundle imports — both phases see identical values, and Zod
// throws at module load on any missing/malformed input.
const AUTH_API_URL = env.NEXT_PUBLIC_AUTH_API_URL

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  let body: { screen_width?: number; screen_height?: number; timezone?: string } = {}
  try {
    body = await request.json()
  } catch { /* no body or invalid JSON — device signals will be omitted */ }

  // * Preserve whatever organization the user is currently scoped to so the
  // * rotated token keeps that context. Falls back to "" when the existing
  // * token is missing/malformed — the auth backend then embeds the user's
  // * primary org automatically (single round-trip, no follow-up call).
  let previousOrgId = ''
  const existingToken = cookieStore.get('access_token')?.value
  if (existingToken) {
    try {
      const payload = JSON.parse(Buffer.from(existingToken.split('.')[1], 'base64').toString())
      if (typeof payload.org_id === 'string') previousOrgId = payload.org_id
    } catch { /* token may be malformed, proceed without org */ }
  }

  try {
    const deviceSignals = body.screen_width ? {
      screen_width: body.screen_width,
      screen_height: body.screen_height,
      timezone: body.timezone,
    } : {}

    const doRefresh = async (orgId: string) => {
      return fetch(`${AUTH_API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': request.headers.get('user-agent') || '',
        },
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

    const cookieDomain = getCookieDomain()

    if (!res.ok) {
      const upstream = await res.json().catch(() => ({ error: 'Unknown' }))
      const reason = upstream?.error || 'Refresh failed'
      const deleteOpts = { path: '/', domain: cookieDomain } as const
      cookieStore.delete({ name: 'access_token', ...deleteOpts })
      if (res.status !== 403) {
        cookieStore.delete({ name: 'refresh_token', ...deleteOpts })
      }
      return NextResponse.json({ error: reason, retryable: res.status === 403 }, { status: res.status })
    }

    const data = await res.json()
    const csrfToken = res.headers.get('X-CSRF-Token')

    cookieStore.set('access_token', data.access_token, {
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

    return NextResponse.json({ success: true, access_token: data.access_token })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
