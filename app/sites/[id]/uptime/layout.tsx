import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Uptime | Pulse',
  description: 'Monitor your site uptime and response times.',
  robots: { index: false, follow: false },
}

export default function UptimeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
