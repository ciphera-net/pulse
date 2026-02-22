import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Integrations | Pulse',
  description: 'Add Pulse analytics to Next.js, React, Vue, WordPress, and more in under a minute.',
  openGraph: {
    title: 'Integrations | Pulse',
    description: 'Add Pulse analytics to Next.js, React, Vue, WordPress, and more in under a minute.',
    siteName: 'Pulse by Ciphera',
  },
}

export default function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
