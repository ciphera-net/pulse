import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Re-declare the brand template here so the nested /integrations/[slug] guides
  // inherit it — this template overrides the root's for the subtree (so the
  // guides get a single suffix). `default` is a bare name: the /integrations
  // directory page is the layout's own segment, so the ROOT template wraps it.
  title: {
    default: 'Integrations',
    template: '%s | Pulse by Ciphera',
  },
  description: 'Pulse works with 75+ frameworks, CMS platforms, and hosting providers. One script tag — any stack.',
  alternates: {
    canonical: '/integrations',
  },
  openGraph: {
    title: 'Integrations',
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
