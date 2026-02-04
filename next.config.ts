import type { NextConfig } from 'next'
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // * Enable standalone output for production deployment
  output: 'standalone',
  // * Privacy-first: Disable analytics and telemetry
  productionBrowserSourceMaps: false,
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/',
        permanent: false,
      },
    ]
  },
}

export default withPWA(nextConfig)
