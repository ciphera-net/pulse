import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGES } from '@/lib/og'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about Pulse, privacy, GDPR compliance, and how it works.',
  alternates: {
    canonical: '/faq',
  },
  openGraph: {
    title: 'FAQ',
    description: 'Frequently asked questions about Pulse, privacy, GDPR compliance, and how it works.',
    siteName: 'Pulse by Ciphera',
    images: DEFAULT_OG_IMAGES,
  },
}

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
