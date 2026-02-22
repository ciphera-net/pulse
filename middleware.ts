import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = new Set([
  '/login',
  '/signup',
  '/auth/callback',
  '/pricing',
  '/features',
  '/about',
  '/faq',
  '/changelog',
  '/installation',
])

const PUBLIC_PREFIXES = [
  '/share/',
  '/integrations',
  '/docs',
]

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

const AUTH_ONLY_ROUTES = new Set(['/login', '/signup'])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const hasAccess = request.cookies.has('access_token')
  const hasRefresh = request.cookies.has('refresh_token')
  const hasSession = hasAccess || hasRefresh

  // * Authenticated user hitting /login or /signup → send them home
  if (hasSession && AUTH_ONLY_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // * Public route → allow through
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // * Protected route without a session → redirect to login
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, manifest.json, icons, images (static assets)
     * - api routes (handled by their own auth)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|.*\\.png$|.*\\.svg$|.*\\.ico$|api/).*)',
  ],
}
