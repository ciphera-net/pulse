import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FAQ | Pulse',
  description: 'Frequently asked questions about Pulse, privacy, GDPR compliance, and how it works.',
  openGraph: {
    title: 'FAQ | Pulse',
    description: 'Frequently asked questions about Pulse, privacy, GDPR compliance, and how it works.',
    siteName: 'Pulse by Ciphera',
  },
}

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
