import type { Metadata } from 'next'
import AuthedHome from '@/components/dashboard/AuthedHome'

// * The authenticated home. Signed-in visitors reach this via the middleware
// * redirect from `/`; it is never served to crawlers (a session cookie is
// * required — anonymous requests are bounced to /login), and it is marked
// * noindex as defence-in-depth so an externally-linked /sites URL is never
// * indexed.
export const metadata: Metadata = {
  title: 'Your sites',
  robots: { index: false, follow: false },
}

export default function SitesPage() {
  return <AuthedHome />
}
