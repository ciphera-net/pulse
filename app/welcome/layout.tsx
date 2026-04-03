import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Welcome — Pulse',
  description: 'Set up your Pulse workspace and add your first site.',
  robots: 'noindex, nofollow',
}

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
