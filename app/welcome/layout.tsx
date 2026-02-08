import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Welcome | Pulse',
  description: 'Set up your Pulse workspace and add your first site.',
}

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
