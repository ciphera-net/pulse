import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Integrations | Pulse',
  description: 'Pulse works with 75+ frameworks, CMS platforms, and hosting providers. One script tag — any stack.',
  openGraph: {
    title: 'Integrations | Pulse',
    description: 'Pulse works with 75+ frameworks, CMS platforms, and hosting providers. One script tag — any stack.',
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
