import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // * Privacy-first: Disable analytics and telemetry
  productionBrowserSourceMaps: false,
  async redirects() {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || 'https://auth.ciphera.net'
    return [
      {
        source: '/login',
        destination: `${authUrl}/login?client_id=analytics-app&redirect_uri=${encodeURIComponent((process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003') + '/auth/callback')}&response_type=code`,
        permanent: false,
      },
      {
        source: '/signup',
        destination: `${authUrl}/signup?client_id=analytics-app&redirect_uri=${encodeURIComponent((process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003') + '/auth/callback')}&response_type=code`,
        permanent: false,
      },
    ]
  },
}

export default nextConfig
