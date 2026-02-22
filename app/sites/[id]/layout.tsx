import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard | Pulse',
  description: 'View your site analytics, traffic, and performance.',
  robots: { index: false, follow: false },
}

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
