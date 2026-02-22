import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Realtime | Pulse',
  description: 'See who is on your site right now.',
  robots: { index: false, follow: false },
}

export default function RealtimeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
