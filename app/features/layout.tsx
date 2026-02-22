import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Features | Pulse',
  description: 'Dashboards, funnels, uptime monitoring, realtime visitors, and more — all without cookies.',
  openGraph: {
    title: 'Features | Pulse',
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
