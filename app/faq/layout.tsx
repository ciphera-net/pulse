import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGES } from '@/lib/og'
import { seoFor } from '@/lib/seo'

// Level 1: merged with a WordPress stub for '/faq' when one exists (design §4.3).
export const metadata: Metadata = seoFor('/faq', {
  title: 'FAQ',
  description: 'Frequently asked questions about Pulse, privacy, GDPR compliance, and how it works.',
  alternates: {
    canonical: '/faq',
  },
  openGraph: {
    title: 'FAQ',
    description: 'Frequently asked questions about Pulse, privacy, GDPR compliance, and how it works.',
    siteName: 'Pulse Analytics',
    images: DEFAULT_OG_IMAGES,
  },
})

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
