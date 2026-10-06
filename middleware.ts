import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTHED_HOME } from '@/lib/routes'

// 🔑 THE MARKETING PAGES ARE NOT HERE (B7, 06-10-2026). Since the split they render in
// ciphera-net/pulse-website, which the Ingress sends `/`, the marketing pages, the
// category pages, /integrations, /vs/, /tools/, /blog, /sitemap.xml, /robots.txt,
// /llms.txt and /sys/seo-state to before this app sees the request. What remains below
// is what THIS app serves to a visitor with no session.
const PUBLIC_ROUTES = new Set([
  '/login',
  '/signup',
  '/auth/callback',
  // * D43 — the ONE dashboard address the marketing `/pricing` page's plan
  // * buttons link to. The marketing app has no session, so the decision
  // * (signup vs. the plan switcher vs. the setup wizard) runs HERE instead; it
  // * must be reachable by an anonymous visitor exactly as /pricing itself is.
  // * See lib/auth/plan-destination.ts.
  '/start/plan',
  '/demo', // * Public live-demo landing page — the dashboard itself, on ciphera.net's live traffic
  // * The claim page must be reachable UNAUTHENTICATED: the login round-trip
  // * loses deep links (ledger 5-3), so a bounced claim link would drop its
  // * token. The page itself tells a signed-out visitor to sign in and click
  // * the (durable) email link again; the API behind it still requires auth.
  '/open-source/claim',
  // * Its startups sibling, for the same reason. The route shipped in #568
  // * WITHOUT this entry — measured on staging and prod 05-09-2026: the
  // * open-source link answered 200 and the startups link 307'd to /login,
  // * which is precisely the bounce that drops the token.
  '/startups/claim',

  '/script.js', // * Tracking script – must load without auth for embedded sites (Shopify, etc.)
  // * The readable source published beside the minified script.js (05-09-2026).
  // * It is a public static asset for exactly the same reason script.js is, and
  // * WITHOUT this line it 307s to /login — measured on staging before promotion,
  // * which would have shipped a debuggability aid nobody outside an authenticated
  // * session could actually fetch from this origin.
  '/script.debug.js',
  // * The optional interaction-capture companion and its readable source.
  // * ⚠️ js.ciphera.net is the PRIMARY path every customer snippet uses; these
  // * entries only keep the pulse.ciphera.net mirror consistent with script.js,
  // * which is public for embedded sites. Without them the mirror 307s while the
  // * core serves 200 — an asymmetry that reads as a broken deploy.
  '/script.interactions.js',
  '/script.interactions.debug.js',
  '/script-sri.json', // * Subresource Integrity manifest (sha384 of the tracking script); consumed by ciphera-website build to pin <script integrity="">.
  // * Static file in public/, so next-pwa precaches it. A 307 to /login here fails
  // * the WHOLE service worker install (workbox aborts on one bad precache
  // * response), so the PWA never installed for signed-out visitors and every page
  // * load logged a fetch error. Same reason sw.js/workbox-*.js are excluded from
  // * the matcher below.
  '/script-versions.json',
  // * The history-import worker (PULSE-107, M2): a static script new Worker()
  // * loads from this origin, and public source in this public repo. Measured on
  // * staging 27-09-2026: without this entry a request with no session 307s to
  // * /login, so a Worker would be handed HTML instead of JavaScript — the same
  // * class of failure sw.js and the tracker files above are exempt from.
  '/workers/import.js',
])

const PUBLIC_PREFIXES = [
  '/share/',
  '/docs',
  '/join/',
  // * A shared report (PULSE-133): its reader has no Pulse account by design,
  // * and the page's own read is the anonymous /public/reports route. Covers
  // * /r/<token> and the PDF runner's /r/<token>/print.
  '/r/',
]

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

const AUTH_ONLY_ROUTES = new Set(['/login', '/signup'])

// * The authenticated home. `/` belongs to the marketing app (the Ingress routes it
// * there), so on this app `/` only ever redirects: a signed-in visitor to here (the
// * site list / last-site entry point), anyone else to /login.
// *
// * 🔑 It now lives in lib/routes.ts because the auth callback needs the same
// * answer. A fresh signup used to land on `/` with no target, get redirected
// * here, RENDER the empty site list, and only then be pushed into the setup
// * wizard by a client effect — reported 08-09-2026 as a flash of "you have no
// * sites" on a brand-new account. The callback resolves its own destination
// * now, and this is the string it names when there is nothing else to resume.

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

  // * Pulse's OWN session cookies (per-app sessions S3), host-only on this
  // * origin. The apex `access_token` / `refresh_token` the ceremony writes on
  // * .ciphera.net still reach this host until S5, and they are deliberately
  // * NOT a session here: a browser holding only those is signed in to
  // * Ciphera ID, not to Pulse, and gets the sign-in gate — which passes it
  // * straight through the OAuth hop without a ceremony.
  const hasAccess = request.cookies.has('pulse_access')
  const hasRefresh = request.cookies.has('pulse_refresh')
  const hasSession = hasAccess || hasRefresh

  // * Authenticated user (with access token) hitting /login or /signup → send them home.
  // * Only check access_token; stale refresh_token alone must not block login (fixes post-inactivity sign-in).
  if (hasAccess && AUTH_ONLY_ROUTES.has(pathname)) {
    return withStagingHeader(NextResponse.redirect(new URL(AUTHED_HOME, request.url)), isStaging)
  }

  // * Signed-in visitor on `/` → their dashboard home. (The marketing app answers `/`
  // * in production and has its own copy of this redirect, middleware.ts there; this
  // * one covers any host whose Ingress sends `/` here — pulse-staging since B7.)
  if (hasSession && pathname === '/') {
    const home = new URL(AUTHED_HOME, request.url)
    // * PULSE-140: a GA4 sign-in whose state failed to verify lands its popup on
    // * `/?ga4=invalid_state`; carry that ONE parameter so /sites can say it.
    const ga4 = request.nextUrl.searchParams.get('ga4')
    if (ga4) home.searchParams.set('ga4', ga4)
    return withStagingHeader(NextResponse.redirect(home), isStaging)
  }

  // * Public route → allow through
  if (isPublicRoute(pathname)) {
    return withStagingHeader(NextResponse.next(), isStaging)
  }

  // * Protected route without a session → redirect to login, CARRYING THE PATH.
  // 🔴 It used to redirect to a bare `/login`, so a cold visit to a deep link —
  // an emailed dashboard URL, a bookmarked settings page — signed you in and
  // then dropped you at the app's front door with no explanation, and the link
  // you followed appeared not to work. The mechanism to carry it already
  // existed and was already honoured by the auth callback
  // (`pulse_auth_return_to`); only this hop never filled it in.
  //
  // ⚠️ The value is NOT trusted here. The edge only echoes back a path it was
  // asked for; `/login` validates it with safeRedirectUrl before storing it,
  // and the callback validates it again on the way out.
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    const wanted = pathname + (request.nextUrl.search || '')
    if (wanted && wanted !== '/') loginUrl.searchParams.set('returnTo', wanted)
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
