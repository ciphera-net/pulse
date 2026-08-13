import { NextRequest, NextResponse } from 'next/server'

/**
 * Same-origin favicon proxy, resolved by Sigil.
 *
 * Two separate leaks had to be closed here, and only the first one was.
 *
 * 1. Browsers once loaded favicons straight from Google's s2 service, which
 *    sent every referrer/page domain — plus the user's IP — to Google from
 *    inside the authenticated app. Fixed by making the fetch server-side: the
 *    user's browser only ever talks to Pulse, and CSP's `img-src` no longer
 *    lists google/gstatic so a regression to a direct <img> fails loudly.
 *
 * 2. The *origin* was still calling Google. This route defaulted to
 *    `https://www.google.com/s2/favicons` whenever `FAVICON_UPSTREAM_URL` was
 *    unset — and production never set it. Staging adopted Sigil on 25-07-2026;
 *    production did not, and the default meant nothing broke, so nothing
 *    surfaced it. For roughly three weeks every domain a Pulse customer tracks
 *    was sent to a US company by a privacy product.
 *
 * That default is now gone, deliberately and permanently. `FAVICON_UPSTREAM_URL`
 * is REQUIRED; there is no fallback to fall back to. A misconfiguration returns
 * 503 and logs, rather than quietly resuming the leak — the whole reason the gap
 * survived is that its failure mode was "works fine".
 *
 * 🔴 Do not re-add a default here. If you need one for local development, set
 * the variable in `.env.local` and point it at a Sigil you run yourself.
 */

// * Sigil — the self-hosted, sovereign favicon resolver
// * (`Infra/Kubernetes/workloads/sigil/`). Nullable on purpose: a missing value
// * is a real state this route must handle explicitly, not something to paper
// * over with a sentinel. Read once at module load; changing it needs a rollout,
// * which is correct — it is deployment configuration, not a request input.
const UPSTREAM: string | null = process.env.FAVICON_UPSTREAM_URL ?? null

// * OPTIONAL second resolver, tried only when the primary fails or has no icon.
// * Unlike UPSTREAM this one may legitimately be absent — absent means "no
// * fallback configured", which is a supported deployment, not a misconfiguration.
// *
// * Production runs primary = Sigil on Bunny Magic Containers (42 regions, via
// * icons.ciphera.net), fallback = the SAME Sigil binary in-cluster. Two reasons
// * that pairing is worth the extra hop:
// *
// *   1. MC resolution is REGION-DEPENDENT. Measured 13-08-2026: stripe.com
// *      resolves through Bunny's CH PoP and 404s through DE1 — a bot-protection
// *      challenge served to some Bunny egress IPs and not others. Production
// *      only ever sees one PoP today (this route is a server-side proxy, so
// *      every fetch originates from the cluster), but Bunny can and does
// *      reroute, and the day it does the failure would look like "some icons
// *      randomly stopped working".
// *   2. It removes MC from the critical path entirely. An MC outage becomes a
// *      slower favicon, not a missing one.
// *
// * 🔴 The fallback must NOT share the primary's failure modes. Pointing both at
// * Bunny would make this decorative.
const FALLBACK_UPSTREAM: string | null = process.env.FAVICON_FALLBACK_UPSTREAM_URL ?? null

// * Sizes actually used by the app (see FAVICON_SERVICE_URL consumers).
const ALLOWED_SIZES = new Set(['16', '32', '64', '128'])

// * Bare hostname only — no scheme, port, path, or IP-literal shapes beyond
// * dotted labels. Anything else 400s and the <img> falls back to its icon.
const DOMAIN_RE = /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export async function GET(request: NextRequest) {
  // * Configuration is checked BEFORE the request is validated, and answers 503
  // * rather than the 404 the not-found path uses. Both choices are deliberate:
  // * a 404 is cached for an hour and renders as "that site has no icon", which
  // * is precisely how a broken upstream would hide. 503 + `no-store` is
  // * distinguishable in logs, distinguishable at the edge, and recovers the
  // * instant the variable is set — no cache to wait out.
  if (!UPSTREAM) {
    console.error(
      '[favicon] FAVICON_UPSTREAM_URL is not set — refusing to resolve favicons. ' +
        'This route has no upstream default by design; set it to the Sigil endpoint ' +
        '(http://sigil.apps.svc.cluster.local/icon in-cluster).'
    )
    return new NextResponse(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const domain = request.nextUrl.searchParams.get('domain')?.trim().toLowerCase() ?? ''
  const sz = request.nextUrl.searchParams.get('sz') ?? '32'

  if (!DOMAIN_RE.test(domain) || !ALLOWED_SIZES.has(sz)) {
    return new NextResponse(null, { status: 400 })
  }

  // * Returns the image bytes, or null for "this resolver had no icon / failed".
  // * Null is the ONLY failure signal on purpose: the caller must not be able to
  // * tell a 404 from a timeout, because it treats them identically — both mean
  // * "ask the next resolver".
  async function resolveVia(base: string, timeoutMs: number): Promise<Response | null> {
    try {
      const upstream = await fetch(`${base}?domain=${encodeURIComponent(domain)}&sz=${sz}`, {
        // * 10s on the primary: Sigil may need a few seconds to fetch a site's page
        // * + candidates on a cold cache; once warm it's near-instant. Too tight a
        // * timeout shows a monogram for icons that would have resolved on a retry.
        // * The fallback gets a SHORTER budget — see the call site.
        signal: AbortSignal.timeout(timeoutMs),
        // * The CDN caches via the response headers below; keep Next's data
        // * cache out of the way so misses don't accumulate on disk.
        cache: 'no-store',
      })
      const contentType = upstream.headers.get('content-type') ?? ''
      if (!upstream.ok || !contentType.startsWith('image/')) return null
      const body = await upstream.arrayBuffer()
      return new NextResponse(body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return null
    }
  }

  const primary = await resolveVia(UPSTREAM, 10000)
  if (primary) return primary

  // * Second resolver, if one is configured. Deliberately given a SHORTER budget
  // * (4s) than the primary: this path only runs after the primary has already
  // * spent up to 10s, and a favicon is decorative — a request that takes 14s to
  // * produce an icon has already lost to the monogram in every way that matters
  // * to the user. Bounding the total keeps a slow upstream from holding a
  // * connection open on every dashboard render.
  if (FALLBACK_UPSTREAM) {
    const secondary = await resolveVia(FALLBACK_UPSTREAM, 4000)
    if (secondary) return secondary
  }

  // * Neither resolver produced an icon. Short-cache it: at 3600s a domain that
  // * gains a favicon tomorrow keeps showing a monogram for an hour, and at 0 a
  // * genuinely icon-less domain re-queries both resolvers on every render.
  return new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
