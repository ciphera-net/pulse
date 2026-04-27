import type { NextConfig } from 'next'
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
  `script-src 'self' 'unsafe-inline' https://pulse.ciphera.net${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com https://ciphera.net https://captcha.ciphera.net https://*.cartocdn.com https://cdn.ciphera.net",
  "font-src 'self'",
  `connect-src 'self' https://*.ciphera.net https://ciphera.net https://www.google.com https://*.gstatic.com https://cdn.jsdelivr.net https://*.cartocdn.com${process.env.NODE_ENV === 'development' ? ' http://localhost:*' : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.ciphera.net",
].join('; ')

const nextConfig: NextConfig = {
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
        source: '/((?!_next/static|_next/image).*)',
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
      {
        source: '/integrations/script-tag',
        destination: 'https://docs.ciphera.net/pulse/script-installation',
        permanent: true,
      },
      {
        source: '/integrations/wordpress',
        destination: 'https://docs.ciphera.net/pulse/wordpress-plugin',
        permanent: true,
      },
      {
        source: '/integrations/:slug',
        destination: 'https://docs.ciphera.net/pulse/framework-guides',
        permanent: true,
      },
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
