import type { NextConfig } from 'next'
import { writeFileSync } from 'fs'
import withPWAInit from "@ducanh2912/next-pwa"

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
})

// * CSP directives — restrict resource loading to known origins
const cspDirectives = [
  "default-src 'self'",
  // Next.js requires 'unsafe-inline' for its bootstrap scripts; 'unsafe-eval' only in dev (HMR).
  // 'wasm-unsafe-eval' lets the browser compile/instantiate the @ciphera-net/tessera OPAQUE
  // WASM core (settings re-auth) — without it WebAssembly.instantiate is CSP-blocked and the
  // re-auth ceremony fails at runtime. It permits WASM compilation only, not arbitrary eval.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.ciphera.net https://api.help.ciphera.net${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // * google/gstatic were only ever here for favicons — those now go through
  // * the same-origin /api/favicon proxy, and CSP enforces that nothing
  // * regresses to loading them from Google directly.
  "img-src 'self' data: blob: https://ciphera.net https://captcha.ciphera.net https://*.cartocdn.com https://cdn.ciphera.net",
  "font-src 'self'",
  `connect-src 'self' https://*.ciphera.net wss://*.ciphera.net https://ciphera.net https://cdn.jsdelivr.net https://*.cartocdn.com${process.env.NODE_ENV === 'development' ? ' http://localhost:* ws://localhost:*' : ''}`,
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
      {
        protocol: 'https',
        hostname: 'www.google.com',
        pathname: '/s2/favicons**',
      },
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
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
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
        permanent: false,
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
