/**
 * generate-seo.ts — pull Level 1 SEO fields from WordPress at BUILD time.
 *
 * A port of Public/ciphera-website/scripts/generate-seo.ts for Pulse. Design:
 * Pulse/docs/plans/30-09-2026-pulse-headless-cms-phase-4-design.md §4
 *
 * 🔴 CONTENT REACHES THIS SITE AT BUILD TIME, NOT AT REQUEST TIME (D37 Phase A —
 * the monolith is not yet split, so this runs as an ordinary prebuild step of
 * pulse-frontend). A WordPress outage blocks the next DEPLOY, never SERVING —
 * see D39 below for what happens when it is unreachable.
 *
 * ⚠️ THE ENDPOINT IS CLUSTER-INTERNAL. This runs on a Woodpecker agent inside the
 * cluster (`labels: runner: k8s`), which is why WordPress needs no public read
 * surface and no secret reaches this public repo.
 */
import fs from 'fs'
import path from 'path'
import { MARKETING_ROUTES } from '../lib/marketing-routes'

export const WP = process.env.WORDPRESS_GRAPHQL_URL ?? 'http://wordpress.apps.svc.cluster.local/graphql'
export const SITE = 'pulse'
const OUT = path.join(process.cwd(), 'lib', 'seo.gen.ts')

/**
 * 🔴 D38 — THE ALLOWLIST IS AN EXACT-PATH SET, NOT A PREFIX MATCH.
 * A stub is admitted only if its path is EXACTLY one of the 25 marketing routes
 * (lib/marketing-routes.ts) — `'/'` matches only `/`. A stub for any other path
 * (`/sites/[id]`, `/settings`, `/vs`, `/tools`) fails the build rather than
 * being silently skipped: a stub nobody can see take effect is exactly the
 * silent shape this programme keeps paying for.
 */
export const ALLOWED_PATHS = new Set(MARKETING_ROUTES)

/**
 * 🔴 THE EXPECTED COUNT IS A COMMITTED, DERIVED GATE.
 * Derived from lib/marketing-routes.ts rather than duplicated as a bare literal
 * — the "three-part change" ciphera.net's own EXPECTED_ROUTES comment warns
 * about (route list, this number, and the alert threshold moving together)
 * collapses to two parts here, because this number can no longer drift from
 * the allowlist it is checked against. Today's value is 25.
 */
export const EXPECTED_ROUTES = MARKETING_ROUTES.length

const QUERY = `{
  routeStubs(first: 100, where: { status: PUBLISH }) {
    nodes {
      cipheraPath
      cipheraTitle
      cipheraDescription
      cipheraCanonical
      cipheraOgTitle
      cipheraOgDescription
      cipheraOgImage
      cipheraTwitterTitle
      cipheraTwitterDescription
      cipheraNoindex
      cipheraNofollow
      modifiedGmt
      routeSites { nodes { slug } }
    }
  }
}`

/**
 * 🔑 EVERY FIELD IS ONE WE OWN, read from post meta by the shared mu-plugin —
 * no SEO plugin's schema appears here (same reasoning as ciphera.net's copy).
 */
export interface RouteStubNode {
  cipheraPath: string | null
  cipheraTitle: string | null
  cipheraDescription: string | null
  cipheraCanonical: string | null
  cipheraOgTitle: string | null
  cipheraOgDescription: string | null
  cipheraOgImage: string | null
  cipheraTwitterTitle: string | null
  cipheraTwitterDescription: string | null
  cipheraNoindex: boolean | null
  cipheraNofollow: boolean | null
  modifiedGmt: string | null
  routeSites: { nodes: { slug: string }[] } | null
}

/** Thrown by fail() — a plain Error would do, but a distinct type lets tests assert on it. */
export class GenerateSeoError extends Error {}

export function fail(msg: string): never {
  throw new GenerateSeoError(msg)
}

/**
 * 🔴 D39 — A CMS OUTAGE MUST NEVER BLOCK A DEPLOY SILENTLY, AND MUST NEVER
 * SHIP A SILENT REVERT EITHER. Retry, bounded, on the shapes that mean
 * "temporarily unreachable" — a network error or an HTTP 5xx. Both measured
 * outages (10-09, 25-09) were WordPress being briefly unreachable during its
 * own deploys or incidents, so most resolve inside this window.
 *
 * An HTTP 4xx or a successful response (even one carrying GraphQL `errors[]`)
 * is NOT a reachability problem — WordPress answered, so there is nothing to
 * retry, and returning here lets main() treat it as a validation failure that
 * CMS_UNAVAILABLE_OK must never be able to mask.
 */
export const RETRY_TOTAL_MS = 120_000
export const RETRY_BASE_MS = 5_000

export type FetchOutcome =
  // WordPress answered with a usable response — proceed to validation.
  | { kind: 'ok'; body: unknown }
  // Network error / timeout / HTTP 5xx, even after the bounded retry — the
  // ONLY outcome CMS_UNAVAILABLE_OK is allowed to override (D39).
  | { kind: 'unavailable'; lastError: string }
  // WordPress answered but REFUSED the request (HTTP 4xx) — a config/contract
  // problem, not an availability one. Never retried, never overridable: an
  // override flag that could mask "we are asking WordPress the wrong
  // question" would be exactly the silent-revert shape D39 forbids.
  | { kind: 'client_error'; lastError: string }

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithRetry(
  wp: string,
  query: string,
  opts: {
    fetchImpl?: typeof fetch
    sleepImpl?: (ms: number) => Promise<void>
    totalMs?: number
    baseMs?: number
    now?: () => number
  } = {}
): Promise<FetchOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const sleepImpl = opts.sleepImpl ?? defaultSleep
  const totalMs = opts.totalMs ?? RETRY_TOTAL_MS
  const baseMs = opts.baseMs ?? RETRY_BASE_MS
  const now = opts.now ?? Date.now

  const deadline = now() + totalMs
  let attempt = 0
  let lastError = ''

  for (;;) {
    attempt += 1
    try {
      const res = await fetchImpl(wp, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (res.ok) {
        return { kind: 'ok', body: await res.json() }
      }

      if (res.status >= 500) {
        lastError = `HTTP ${res.status} from ${wp}`
      } else {
        return { kind: 'client_error', lastError: `HTTP ${res.status} from ${wp}` }
      }
    } catch (e) {
      lastError = `cannot reach WordPress at ${wp} — ${(e as Error).message}`
    }

    if (now() >= deadline) {
      return { kind: 'unavailable', lastError }
    }
    await sleepImpl(Math.min(baseMs * attempt, deadline - now()))
  }
}

/**
 * Validate + dedupe the fetched nodes against the D38 allowlist. Fails the
 * build on the first path outside the set, and on any duplicate — a stub
 * ships to at most one route, ever.
 */
export function buildRouteMap(nodes: RouteStubNode[]): Map<string, RouteStubNode> {
  const seen = new Map<string, RouteStubNode>()

  for (const n of nodes) {
    const p = (n.cipheraPath ?? '').trim()
    if (!p) fail('a published stub has an empty path — it can never match a route, and looks correct in wp-admin')
    if (!p.startsWith('/')) fail(`path "${p}" does not start with "/"`)

    const sites = n.routeSites?.nodes?.map((t) => t.slug) ?? []
    if (!sites.includes(SITE)) continue // ciphera.net's stubs (and any other tenant's) live in the same WordPress

    // D38: exact-path allowlist. '/' matches only '/' because ALLOWED_PATHS
    // is a Set of literal strings, never a prefix test.
    if (!ALLOWED_PATHS.has(p)) {
      fail(
        `stub for "${p}" is not one of the ${EXPECTED_ROUTES} Level 1 marketing routes ` +
          `(lib/marketing-routes.ts). A stub outside that set would ship to a route ` +
          `nobody decided should be CMS-controlled — publish it under an allowed path, ` +
          `or add the route to lib/marketing-routes.ts first.`
      )
    }

    if (seen.has(p)) fail(`duplicate stub for ${p} — two stubs for one route`)
    seen.set(p, n)
  }

  return seen
}

/** Per-stub field gates — same shape ciphera.net applies. */
export function validateStub(p: string, n: RouteStubNode): void {
  const ogImage = (n.cipheraOgImage ?? '').trim()

  // 🔴 THE CDN RULE IS A BUILD GATE, NOT A CONVENTION. Images live on
  // cdn.ciphera.net; the WordPress media library must never become a second,
  // unbacked image host.
  if (ogImage && !ogImage.startsWith('https://cdn.ciphera.net/')) {
    fail(`${p}: OG image is not on cdn.ciphera.net — got "${ogImage}"`)
  }

  // A stub with a title but no description, or vice versa, is a half-filled entry
  // that looks complete in wp-admin. Both are load-bearing in a SERP.
  if (!(n.cipheraTitle ?? '').trim()) fail(`${p}: stub has no title`)
  if (!(n.cipheraDescription ?? '').trim()) fail(`${p}: stub has no meta description`)
}

export interface GeneratedRoute {
  title: string
  description: string
  canonical: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  twitterTitle: string
  twitterDescription: string
  noindex: boolean
  nofollow: boolean
  modified: string
}

export function toGeneratedRoute(n: RouteStubNode): GeneratedRoute {
  return {
    title: n.cipheraTitle ?? '',
    description: n.cipheraDescription ?? '',
    canonical: (n.cipheraCanonical ?? '').trim(),
    ogTitle: n.cipheraOgTitle ?? '',
    ogDescription: n.cipheraOgDescription ?? '',
    ogImage: (n.cipheraOgImage ?? '').trim(),
    twitterTitle: n.cipheraTwitterTitle ?? '',
    twitterDescription: n.cipheraTwitterDescription ?? '',
    noindex: n.cipheraNoindex === true,
    nofollow: n.cipheraNofollow === true,
    modified: n.modifiedGmt ?? '',
  }
}

/**
 * 🔴 A WATERMARK IS A MAXIMUM, AND MAXIMA ONLY MOVE FORWARD (same reasoning as
 * ciphera.net's copy). Unpublish the newest stub and the max falls BELOW what
 * the live site already served, so a naive `desired > actual` comparison would
 * go false and a future watcher would report healthy forever while serving
 * deleted content. That is why the route COUNT ships alongside the watermark
 * in /sys/seo-state, not just this string.
 */
export function computeWatermark(nodes: RouteStubNode[]): string {
  return (
    nodes
      .map((n) => n.modifiedGmt ?? '')
      .filter(Boolean)
      .sort()
      .at(-1) ?? ''
  )
}

function renderOutput(
  seen: Map<string, GeneratedRoute>,
  watermark: string,
  override: boolean
): string {
  const banner = `// Auto-generated from WordPress at build time — do not edit manually.
// Run: npm run generate:seo   (source: ${WP})
//
// 🔴 THIS FILE IS BUILD OUTPUT, NOT SOURCE. Editing it changes nothing: the next
// build overwrites it from WordPress. To change a title or a meta description, edit
// the route's stub at https://cms.ciphera.net → Route SEO.
`

  const out: Record<string, GeneratedRoute> = {}
  for (const [p, route] of [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    out[p] = route
  }

  return `${banner}
import type { RouteSeo } from './seo'

export const SEO_ROUTE_COUNT = ${seen.size}

/**
 * 🔑 THE WATERMARK IS WHAT MAKES A FUTURE PUBLISH WATCHER LEVEL-TRIGGERED (D37
 * Phase C — no watcher exists yet in Phase A, but this build already reports
 * what it would need). The newest \`modifiedGmt\` this build consumed, served
 * at /sys/seo-state.
 */
export const SEO_WATERMARK = ${JSON.stringify(watermark)}

/**
 * 🔴 D39 — SET ONLY WHEN THIS BUILD SHIPPED WITHOUT CONSULTING WORDPRESS AT
 * ALL, because WordPress stayed unreachable through the bounded retry AND a
 * human explicitly passed CMS_UNAVAILABLE_OK=1. Every route then renders its
 * page's own built-in metadata (routeSeo is empty), and /sys/seo-state reports
 * this flag until the next normal build overwrites it — so an override build
 * can never be mistaken for a normal one.
 */
export const SEO_OVERRIDE = ${override}

export const routeSeo: Record<string, RouteSeo> = ${JSON.stringify(out, null, 2)}
`
}

/**
 * Orchestrates one generator run. Split out from the CLI entrypoint below so
 * tests can call it directly with an injected fetch/sleep/clock and a scratch
 * output path, instead of spawning a real process against a real network.
 */
export async function run(opts: {
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
  totalMs?: number
  baseMs?: number
  now?: () => number
  outPath?: string
  cmsUnavailableOk?: boolean
} = {}): Promise<{ routeCount: number; watermark: string; override: boolean }> {
  const outPath = opts.outPath ?? OUT

  const outcome = await fetchWithRetry(WP, QUERY, opts)

  if (outcome.kind === 'client_error') {
    // WordPress answered and refused — never retryable, never maskable by
    // CMS_UNAVAILABLE_OK (see the FetchOutcome comment above).
    fail(outcome.lastError)
  }

  if (outcome.kind === 'unavailable') {
    if (opts.cmsUnavailableOk) {
      // D39 step 3: the explicit, visible override. Never silent — every line
      // below is deliberately loud, and it is the ONLY path that ever writes
      // an empty routeSeo without every route having a real stub.
      console.error(`
🔴🔴🔴 WORDPRESS UNREACHABLE — SHIPPING WITHOUT LEVEL 1 SEO OVERRIDES 🔴🔴🔴

  ${outcome.lastError}

  CMS_UNAVAILABLE_OK=1 was set, so this build proceeds with NO route stubs —
  every page renders its own built-in metadata, exactly as before Level 1
  existed. /sys/seo-state will report override:true until the next normal
  build.

  This was a deliberate, human-triggered override, not a silent fallback.
🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴
`)
      const content = renderOutput(new Map(), '', true)
      fs.writeFileSync(outPath, content, 'utf-8')
      return { routeCount: 0, watermark: '', override: true }
    }

    fail(outcome.lastError)
  }

  const body = outcome.body as {
    errors?: unknown[]
    data?: { routeStubs?: { nodes?: RouteStubNode[] } }
  }

  // 🔴 A PARTIAL RESPONSE IS WORSE THAN NO RESPONSE. WPGraphQL can return HTTP 200
  // with a populated `errors` array and partial `data`; this is a real validation
  // failure — CMS_UNAVAILABLE_OK must NOT be able to mask it, and it does not,
  // because that flag only ever short-circuits the unreachable branch above.
  if (body.errors?.length) fail(`GraphQL errors: ${JSON.stringify(body.errors)}`)

  const nodes: RouteStubNode[] = body?.data?.routeStubs?.nodes ?? []
  const seen = buildRouteMap(nodes)

  if (seen.size !== EXPECTED_ROUTES) {
    fail(
      `expected ${EXPECTED_ROUTES} ${SITE} stubs, found ${seen.size}.\n` +
        `   Found: ${[...seen.keys()].sort().join(', ')}\n` +
        `   Missing or unpublished: ${MARKETING_ROUTES.filter((r) => !seen.has(r))
          .sort()
          .join(', ')}\n` +
        `   A stub was deleted, unpublished, trashed, or has not been seeded yet — the\n` +
        `   affected route(s) would silently fall back to their hardcoded metadata. If the\n` +
        `   route set itself changed, update lib/marketing-routes.ts in the same commit.`
    )
  }

  for (const [p, n] of seen) validateStub(p, n)

  const generated = new Map<string, GeneratedRoute>()
  for (const [p, n] of seen) generated.set(p, toGeneratedRoute(n))

  const watermark = computeWatermark([...seen.values()])
  const content = renderOutput(generated, watermark, false)
  fs.writeFileSync(outPath, content, 'utf-8')

  console.log(`Generated ${seen.size} route stubs → ${path.relative(process.cwd(), outPath)}`)
  for (const p of [...seen.keys()].sort()) console.log(`  ${p}`)

  return { routeCount: seen.size, watermark, override: false }
}

/**
 * The CLI entrypoint — a plain exported function, never called at module
 * load. That is deliberate: this file has no top-level side effects, so
 * `npm test` can import every export above (including this one, which it
 * never calls) without making a network call. `scripts/run-ts.mjs` is what
 * actually invokes it for `npm run generate:seo`.
 */
export async function main(): Promise<void> {
  try {
    await run({ cmsUnavailableOk: process.env.CMS_UNAVAILABLE_OK === '1' })
  } catch (e) {
    console.error(`\n🔴 generate-seo: ${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  }
}
