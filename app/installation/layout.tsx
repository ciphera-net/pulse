import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGES } from '@/lib/og'
import { seoFor } from '@/lib/seo'

// The installation page is a client component (interactive code blocks) and so
// cannot export metadata itself — this layout owns its title, description and
// self-canonical instead of letting it inherit the root homepage title.
//
// Level 1: merged with a WordPress stub for '/installation' when one exists (design §4.3).
export const metadata: Metadata = seoFor('/installation', {
  title: 'Install Pulse — one script tag',
  description:
    'Add privacy-first analytics to any site with a single script tag. Setup guides for Next.js, WordPress, React and 75+ other frameworks — no cookies, no consent banner.',
  alternates: {
    canonical: '/installation',
  },
  openGraph: {
    title: 'Install Pulse — one script tag',
    description:
      'Add privacy-first analytics to any site with a single script tag. Setup guides for 75+ frameworks — no cookies, no consent banner.',
    siteName: 'Pulse Analytics',
    images: DEFAULT_OG_IMAGES,
  },
})

export default function InstallationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
