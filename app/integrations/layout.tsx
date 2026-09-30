import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGES } from '@/lib/og'
import { seoFor } from '@/lib/seo'

// Level 1: merged with a WordPress stub for '/integrations' when one exists
// (design §4.3). A stub's title replaces the `default` below with an
// `absolute` string; the 75 /integrations/[slug] guides are NOT L1 (D38) and
// keep inheriting the `template` regardless of whether '/integrations' itself
// has a stub.
export const metadata: Metadata = seoFor('/integrations', {
  // Re-declare the brand template here so the nested /integrations/[slug] guides
  // inherit it — this template overrides the root's for the subtree (so the
  // guides get a single suffix). `default` is a bare name: the /integrations
  // directory page is the layout's own segment, so the ROOT template wraps it.
  title: {
    default: 'Integrations',
    template: '%s | Pulse Analytics',
  },
  description: 'Pulse works with 75+ frameworks, CMS platforms, and hosting providers. One script tag — any stack.',
  alternates: {
    canonical: '/integrations',
  },
  openGraph: {
    title: 'Integrations',
    description: 'Pulse works with 75+ frameworks, CMS platforms, and hosting providers. One script tag — any stack.',
    siteName: 'Pulse Analytics',
    images: DEFAULT_OG_IMAGES,
  },
})

export default function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
