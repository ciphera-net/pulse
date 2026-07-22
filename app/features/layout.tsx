import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Features',
  description: 'Dashboards, funnels, uptime monitoring, realtime visitors, and more — all without cookies.',
  alternates: {
    canonical: '/features',
  },
  openGraph: {
    title: 'Features',
    description: 'Dashboards, funnels, uptime monitoring, realtime visitors, and more — all without cookies.',
    siteName: 'Pulse by Ciphera',
  },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
