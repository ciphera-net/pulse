import { SEO_WATERMARK, SEO_ROUTE_COUNT, SEO_OVERRIDE, SEO_GENERATED } from '@/lib/seo'

/**
 * The build's own self-report for Level 1 SEO (design §4.4).
 *
 * 🔑 A future publish watcher (D37 Phase C — not built yet) would read this and
 * compare it against WordPress's current newest `modifiedGmt`; both sides are
 * queryable, so it would store no state of its own. That detects a missed
 * deploy for ANY reason — a failed pipeline, a reverted commit, an image
 * rolled back by hand — not merely a publish a webhook happened to witness.
 *
 * ⚠️ THESE VALUES ARE BAKED AT BUILD TIME. That is the point — this endpoint
 * reports what this image was built from, never what WordPress currently holds.
 */
export const dynamic = 'force-static'

export function GET() {
  return Response.json(
    {
      site: 'pulse',
      routes: SEO_ROUTE_COUNT,
      newestModifiedGmt: SEO_WATERMARK,
      // 🔑 WHICH COMMIT IS RENDERING THIS. The fields above answer "is the site
      // up to date with the CMS"; this answers "is this instance up to date with
      // the CODE" — threaded in via the `next-build` CI step's CIPHERA_BUILD_SHA
      // env var, the same shape ciphera.net uses (see .woodpecker/push.yml).
      sha: process.env.CIPHERA_BUILD_SHA ?? 'unknown',
      // 🔴 D39 — true only when this build shipped with NO route stubs because
      // WordPress stayed unreachable through the bounded retry and a human
      // explicitly passed CMS_UNAVAILABLE_OK=1. Stays true on the live site
      // until the next normal build overwrites it.
      override: SEO_OVERRIDE,
      // false means this image was built from the committed empty stub, never
      // from the generator — which a normal `npm run build` cannot do (prebuild
      // runs it first), so on production it would mean a broken build path.
      generated: SEO_GENERATED,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
