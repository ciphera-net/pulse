import type { NextConfig } from 'next'
import { writeFileSync } from 'fs'
import withPWAInit from "@ducanh2912/next-pwa"

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  // * The tracker and its release manifests must NOT be in the SW precache.
  // * Workbox aborts the ENTIRE install when any one precache fetch fails, and
  // * script.js is exactly the kind of URL content blockers kill — one blocked
  // * fetch turned into a dead service worker for that visitor (observed
  // * 01-09-2026, Vemetric comparison audit §10). The tracker is for CUSTOMER
  // * sites anyway; the dashboard shell never imports it.
  publicExcludes: ["script.js", "script-sri.json", "script-versions.json"],
})

// * ═══ /_next/static/* IS SERVED FROM ITS OWN CDN ZONE ═══
// *
// * WHY: pulse.ciphera.net moves to Bunny Magic Containers, and an MC rollout is
// * PROGRESSIVE — ~10-15 minutes across its region set. Next.js HTML references
// * content-hashed chunks, so a mixed-version fleet 404s in BOTH directions: old HTML
// * asking an already-updated region for a chunk it no longer has, AND new HTML asking
// * a not-yet-updated one. Simply not purging static only ever covered the first case.
// * At 1489 real req/h that is hundreds of sessions per deploy — which is why this is a
// * PREREQUISITE for the MC migration, not an optimisation (frontends plan §3.5).
// *
// * Chunks now come from a storage-backed zone that KEEPS EVERY BUILD'S OUTPUT, so the
// * URL a given HTML references is always resolvable whichever app version answers.
// *
// * 🔴 The upload in .woodpecker/deploy.yml runs BEFORE the rollout and FAILS the deploy
// * if it cannot complete. That ordering is load-bearing: with a prefix set, an image
// * whose assets were never uploaded serves a page where EVERY chunk 404s.
// *
// * ⚠️ DEFAULTS TO EMPTY ON PURPOSE. An unset build arg degrades to serving assets from
// * the app itself — the site works, it just loses the decoupling. The alternative
// * (baking the production URL in as the default, which is what `help` did) would make a
// * STAGING build silently serve PRODUCTION chunks, i.e. a different build's JavaScript.
// * Safe degradation beats a wrong default. The pipeline asserts the live HTML actually
// * references this host after deploy, so "silently off" is caught rather than trusted.
const ASSET_PREFIX = process.env['NEXT_PUBLIC_ASSET_PREFIX'] ?? ''

// * The zone that serves those chunks. Kept as a constant because it appears in FOUR CSP
// * directives and a typo in any one of them is a blank page, not an error.
// * ⚠️ It is a `.b-cdn.net` host, so it is NOT covered by the `https://*.ciphera.net`
// * already present in connect-src — every directive needs it spelled out.
const ASSET_CDN = 'https://ciphera-app-static.b-cdn.net'

// * CSP directives — restrict resource loading to known origins
const cspDirectives = [
  "default-src 'self'",
  // Next.js requires 'unsafe-inline' for its bootstrap scripts; 'unsafe-eval' only in dev (HMR).
  // 'wasm-unsafe-eval' lets the browser compile/instantiate the @ciphera-net/tessera OPAQUE
  // WASM core (settings re-auth) — without it WebAssembly.instantiate is CSP-blocked and the
  // re-auth ceremony fails at runtime. It permits WASM compilation only, not arbitrary eval.
  // 🔴 ASSET_CDN is a DELIBERATE WIDENING of script-src. It is our own zone and serves
  // nothing but build output, but it does mean a compromise of that bucket is script
  // execution on the authenticated dashboard. That is precisely why it is a DEDICATED
  // storage zone with its own write credential (Woodpecker org secret
  // `app_static_storage_password`) rather than the shared cdn.ciphera.net assets bucket:
  // the credential used for routine image uploads must not gain script execution here.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.ciphera.net https://api.help.ciphera.net ${ASSET_CDN}${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline' ${ASSET_CDN}`,
  // * google/gstatic were only ever here for favicons — those now go through
  // * the same-origin /api/favicon proxy, and CSP enforces that nothing
  // * regresses to loading them from Google directly.
  "img-src 'self' data: blob: https://ciphera.net https://captcha.ciphera.net https://*.cartocdn.com https://cdn.ciphera.net",
  // next/font emits its woff2 files under /_next/static/media, so they move with the rest.
  `font-src 'self' ${ASSET_CDN}`,
  `connect-src 'self' https://*.ciphera.net wss://*.ciphera.net https://ciphera.net https://cdn.jsdelivr.net https://*.cartocdn.com ${ASSET_CDN}${process.env.NODE_ENV === 'development' ? ' http://localhost:* ws://localhost:*' : ''}`,
  "worker-src 'self' blob:",
  "frame-src https://api.help.ciphera.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.ciphera.net",
].join('; ')

const BUILD_ID = Date.now().toString()
writeFileSync('public/build-id.json', JSON.stringify({ buildId: BUILD_ID }))

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  reactStrictMode: true,
  // * Production only — `next dev` must keep serving its own assets, and an empty
  // * prefix must stay a no-op rather than emitting `//_next/...`.
  ...(process.env.NODE_ENV === 'production' && ASSET_PREFIX ? { assetPrefix: ASSET_PREFIX } : {}),
  // * Enable standalone output for production deployment
  output: 'standalone',
  // * Privacy-first: Disable analytics and telemetry
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react'],
  },
  // @ciphera-net/tessera ships a WASM OPAQUE core (settings re-auth). Keep it out of
  // the server bundle — it is a client-only SDK loaded via init() in the browser — so
  // the server build never tries to bundle the .wasm binary.
  serverExternalPackages: ['@ciphera-net/tessera'],
  // Turbopack (next dev) path: stub Node's `fs` for the BROWSER bundle only. The
  // SDK's isomorphic loader references a Node WASM target (`require('fs')`) that is
  // never reached client-side (isNode() === false) but is still traversed by the
  // bundler. A `turbopack` block is also required to pair with the webpack fallback
  // below — a webpack config without one is a hard build error in Next 16.
  turbopack: {
    resolveAlias: {
      fs: { browser: './lib/tessera-fs-stub.js' },
    },
  },
  // Webpack path (next build --webpack — Pulse's production build): enable
  // asyncWebAssembly + emit tessera_bg.wasm as a static asset, and stub `fs` for the
  // browser bundle (mirrors the Turbopack alias above).
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true }
    config.module.rules.push({ test: /\.wasm$/, type: 'asset/resource' })
    config.resolve = config.resolve || {}
    config.resolve.fallback = { ...config.resolve.fallback, fs: false }
    return config
  },
  images: {
    remotePatterns: [
      // * `www.google.com/s2/favicons**` was removed 13-08-2026. It was the last
      // * standing permission for Google in this app: favicons have gone through
      // * the same-origin `/api/favicon` proxy (rendered `unoptimized`) for
      // * months, so the pattern granted nothing that was in use — but it left
      // * the door open for an <Image src> pointing straight at Google to start
      // * working again without tripping CSP review. See app/api/favicon/route.ts.
      {
        protocol: 'https',
        hostname: 'ciphera.net',
      },
      {
        protocol: 'https' as const,
        hostname: 'cdn.ciphera.net',
      },
    ],
  },
  async headers() {
    return [
      {
        // * Prevent CDN/browser from serving stale HTML after deploys.
        // * Static assets (/_next/static/*) are content-hashed and cached separately by Next.js.
        // * /api/favicon sets its own long-lived Cache-Control (the CDN must cache
        // * it, or every favicon render becomes an origin hit + upstream fetch).
        source: '/((?!_next/static|_next/image|api/favicon).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // * `browsing-topics=()` is the current opt-out. It replaced
            // * `interest-cohort=()`, which named the withdrawn FLoC proposal — no
            // * browser has recognised that feature since, and Chrome logged
            // * "Unrecognized feature: 'interest-cohort'" on every page load.
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // ⚠️ AUTHORITATIVE COPY IS AT THE EDGE, NOT HERE.
          // Traefik's `security-headers` middleware (applied to every router via
          // `default-chain`, see Infra/Kubernetes/addons/20-traefik/middlewares.yaml)
          // sets this header and OVERWRITES whatever the app sends. This value is kept
          // in sync with it so the file does not describe a policy we do not ship; it is
          // defence-in-depth for any path that ever bypasses that middleware.
          //
          // It previously read `max-age=63072000; includeSubDomains; preload`, which was
          // dead config: the wire has always carried max-age=31536000 and no `preload`.
          // 🔴 Do NOT re-add `preload` here. Preload is a one-way commitment recorded as
          // an explicit owner decision at middlewares.yaml (`stsPreload: false`); adding
          // it in this file changes nothing on the wire and only re-creates the illusion.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'Content-Security-Policy', value: cspDirectives },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/',
        permanent: true,
      },
      // PageSpeed became Performance. The old path is BOOKMARKABLE and is linked
      // from notification emails already delivered, so it has to keep resolving —
      // a rename that 404s the previous URL is a rename that loses the reader.
      //
      // The name went because it was Google's: "PageSpeed" IS PageSpeed Insights,
      // and this instrument stopped calling Google's API at the 14-08-2026 cutover
      // to a self-hosted Lighthouse. It also described one of the four categories
      // it reports (performance, accessibility, best practices, SEO).
      {
        source: '/sites/:id/pagespeed',
        destination: '/sites/:id/performance',
        permanent: true,
      },
      {
        source: '/sites/:id/pagespeed/:path*',
        destination: '/sites/:id/performance/:path*',
        permanent: true,
      },
      // NOTE: the former `/integrations/:slug` → docs.ciphera.net redirects were
      // removed. They shadowed the real per-integration guide pages
      // (app/integrations/[slug]) and pointed at a defunct host (docs moved to
      // help.ciphera.net). Each guide page now links out to help.ciphera.net
      // via the registry's docsSlug.
    ]
  },
  async rewrites() {
    return [
      {
        source: '/docs',
        destination: 'https://ciphera-e9ed055e.mintlify.dev/docs',
      },
      {
        source: '/docs/:path*',
        destination: 'https://ciphera-e9ed055e.mintlify.dev/docs/:path*',
      },
    ]
  },
}

export default withPWA(nextConfig)
