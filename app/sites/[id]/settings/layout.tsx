import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Site Settings | Pulse',
  description: 'Configure your site tracking, privacy, and goals.',
  robots: { index: false, follow: false },
}

export default function SiteSettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
