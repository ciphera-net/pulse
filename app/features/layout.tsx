import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGES } from '@/lib/og'
import { seoFor } from '@/lib/seo'

// Level 1: merged with a WordPress stub for '/features' when one exists (design §4.3).
export const metadata: Metadata = seoFor('/features', {
  title: 'Features',
  description: 'Dashboards, funnels, uptime monitoring, realtime visitors, and more — all without cookies.',
  alternates: {
    canonical: '/features',
  },
  openGraph: {
    title: 'Features',
    description: 'Dashboards, funnels, uptime monitoring, realtime visitors, and more — all without cookies.',
    siteName: 'Pulse Analytics',
    images: DEFAULT_OG_IMAGES,
  },
})

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
