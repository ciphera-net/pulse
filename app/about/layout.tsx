import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About | Pulse',
  description: 'Pulse is built by Ciphera — privacy-first web analytics made in Switzerland.',
  openGraph: {
    title: 'About | Pulse',
    description: 'Pulse is built by Ciphera — privacy-first web analytics made in Switzerland.',
    siteName: 'Pulse by Ciphera',
  },
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
