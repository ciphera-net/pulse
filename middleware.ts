import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/auth/callback',
  '/pricing',
  '/features',
  '/about',
  '/faq',
  '/changelog',
  '/installation',
  '/demo', // * Public live-demo landing page — links out to the ciphera.net share view

  // * Category-SEO landing pages (21-07). Public marketing surface — must render
  // * for anonymous visitors and crawlers, same as /features or /pricing.
  '/cookieless-analytics',
  '/gdpr-compliant-analytics',
  '/google-analytics-alternative',
  '/analytics-without-cookie-banner',
  '/eu-web-analytics',

  '/script.js', // * Tracking script – must load without auth for embedded sites (Shopify, etc.)
  '/script.frustration.js', // * Frustration tracking add-on (rage clicks, dead clicks)
  '/script-sri.json', // * Subresource Integrity manifest (sha384 of both scripts); consumed by ciphera-website build to pin <script integrity="">.
])

const PUBLIC_PREFIXES = [
  '/share/',
  '/integrations',
  '/vs/', // * Public /vs/[slug] comparison cluster (Pulse vs <competitor>)
  '/tools/', // * Public client-side tools (UTM builder, cookie-banner calculator)
  '/docs',
  '/join/',
]

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

const AUTH_ONLY_ROUTES = new Set(['/login', '/signup'])

// * The authenticated home. The public marketing homepage lives at `/` and must
// * server-render for crawlers, so signed-in visitors are redirected here (the
// * site list / last-site entry point) instead of `/`.
const AUTHED_HOME = '/sites'

const STAGING_HOST = 'pulse-staging.ciphera.net'
const STAGING_ROBOTS = 'User-agent: *\nDisallow: /\n'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isStaging = request.headers.get('host') === STAGING_HOST

  // * Staging defence-in-depth (the edge already ships X-Robots-Tag; this is a
  // * second, app-level guarantee independent of the CDN config). Answer
  // * /robots.txt with a blanket Disallow and tag every response noindex so a
  // * stray crawl of the staging host can never pollute the brand SERP.
  if (pathname === '/robots.txt') {
    // robots.txt is not auth-gated — handle it before any redirect logic.
    if (isStaging) {
      return new NextResponse(STAGING_ROBOTS, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    return withStagingHeader(NextResponse.next(), isStaging)
  }

  const hasAccess = request.cookies.has('access_token')
  const hasRefresh = request.cookies.has('refresh_token')
  const hasSession = hasAccess || hasRefresh

  // * Authenticated user (with access token) hitting /login or /signup → send them home.
  // * Only check access_token; stale refresh_token alone must not block login (fixes post-inactivity sign-in).
  if (hasAccess && AUTH_ONLY_ROUTES.has(pathname)) {
    return withStagingHeader(NextResponse.redirect(new URL(AUTHED_HOME, request.url)), isStaging)
  }

  // * Signed-in visitor hitting the public homepage → their dashboard home.
  // * Keeps `/` a pure, server-rendered marketing page for anonymous crawlers
  // * while preserving the authenticated landing experience.
  if (hasSession && pathname === '/') {
    return withStagingHeader(NextResponse.redirect(new URL(AUTHED_HOME, request.url)), isStaging)
  }

  // * Public route → allow through
  if (isPublicRoute(pathname)) {
    return withStagingHeader(NextResponse.next(), isStaging)
  }

  // * Protected route without a session → redirect to login
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    return withStagingHeader(NextResponse.redirect(loginUrl), isStaging)
  }

  return withStagingHeader(NextResponse.next(), isStaging)
}

// * Tag every staging response noindex,nofollow. No-op on production hosts.
function withStagingHeader(response: NextResponse, isStaging: boolean): NextResponse {
  if (isStaging) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return response
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, manifest.json, icons, images (static assets)
     * - sw.js, workbox-*.js (service worker — a redirect here breaks registration
     *   with a SecurityError; must be reachable without auth on every page)
     * - api routes (handled by their own auth)
     * robots.txt IS matched (unlike sitemap.xml/llms.txt) so the staging host can
     * serve a blanket-Disallow robots.txt and every response can be tagged noindex.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sitemap\\.xml|llms\\.txt|build-id\\.json|sw\\.js$|workbox-.*\\.js$|.*\\.png$|.*\\.svg$|.*\\.ico$|api/).*)',
  ],
}
