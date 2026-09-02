import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGES } from '@/lib/og'

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
    images: DEFAULT_OG_IMAGES,
  },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
