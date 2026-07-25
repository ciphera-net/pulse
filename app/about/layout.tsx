import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'Pulse is privacy-first web analytics built by Ciphera BV in Belgium — data hosted in Switzerland/EU.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About',
    description: 'Pulse is privacy-first web analytics built by Ciphera BV in Belgium — data hosted in Switzerland/EU.',
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
