import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8081'

// * Determine cookie domain dynamically
const getCookieDomain = () => {
  if (process.env.NODE_ENV === 'production') {
    return '.ciphera.net'
  }
  return undefined
}

export async function POST() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  try {
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

    return NextResponse.json({ success: true, access_token: data.access_token })
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
