import type { Metadata } from 'next'
import AuthedHome from '@/components/dashboard/AuthedHome'
import { GA4LandingNotice } from '@/components/settings/import/GA4LandingNotice'

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
  return (
    <>
      <AuthedHome />
      {/* The signed-in half of `/?ga4=invalid_state`: the middleware carries the code here (PULSE-140). */}
      <GA4LandingNotice />
    </>
  )
}
