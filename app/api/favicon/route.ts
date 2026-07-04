import { NextRequest, NextResponse } from 'next/server'

/**
 * Same-origin favicon proxy.
 *
 * Browsers previously loaded favicons straight from Google's s2 service,
 * which sent every referrer/page domain — plus the user's IP — to Google
 * from inside the authenticated app. The upstream fetch now happens
 * server-side, so the only party that ever contacts Google is our origin
 * on a CDN cache miss; the user's browser only talks to Pulse. CSP has
 * dropped the google/gstatic allowances, so a regression fails loudly.
 */

const UPSTREAM = 'https://www.google.com/s2/favicons'

// * Sizes actually used by the app (see FAVICON_SERVICE_URL consumers).
const ALLOWED_SIZES = new Set(['16', '32', '64', '128'])

// * Bare hostname only — no scheme, port, path, or IP-literal shapes beyond
// * dotted labels. Anything else 400s and the <img> falls back to its icon.
const DOMAIN_RE = /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain')?.trim().toLowerCase() ?? ''
  const sz = request.nextUrl.searchParams.get('sz') ?? '32'

  if (!DOMAIN_RE.test(domain) || !ALLOWED_SIZES.has(sz)) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const upstream = await fetch(`${UPSTREAM}?domain=${encodeURIComponent(domain)}&sz=${sz}`, {
      signal: AbortSignal.timeout(4000),
      // * The CDN caches via the response headers below; keep Next's data
      // * cache out of the way so misses don't accumulate on disk.
      cache: 'no-store',
    })
    const contentType = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !contentType.startsWith('image/')) {
      return new NextResponse(null, {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      })
    }
    const body = await upstream.arrayBuffer()
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    // * Upstream unreachable/timed out — short-cache the miss to absorb storms.
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  }
}
