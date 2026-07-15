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
  // Next.js requires 'unsafe-inline' for its bootstrap scripts; 'unsafe-eval' only in dev (HMR)
  `script-src 'self' 'unsafe-inline' https://js.ciphera.net https://api.help.ciphera.net${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
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
