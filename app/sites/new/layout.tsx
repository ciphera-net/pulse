import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create site | Pulse',
  description: 'Add a new site to start collecting privacy-friendly analytics.',
}

export default function NewSiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
