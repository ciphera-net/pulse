import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Funnels | Pulse',
  description: 'Track conversion funnels and user journeys.',
  robots: { index: false, follow: false },
}

export default function FunnelsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
