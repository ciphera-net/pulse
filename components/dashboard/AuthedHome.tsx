'use client'

import { LoadingOverlay } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { cdnUrl } from '@/lib/cdn'
import HomeDashboard from '@/components/dashboard/HomeDashboard'

// * The authenticated home (the site list / last-site entry point). Previously
// * this lived at `/` inside HomePageClient; middleware now redirects signed-in
// * visitors from `/` to `/sites` so the public homepage can server-render for
// * crawlers. The org-context guard is preserved: HomeDashboard's data hooks
// * (useSites, etc.) must only fire once auth is fully ready, otherwise SWR
// * caches an empty/401 response for 30s in the post-login race.
export default function AuthedHome() {
  const { user, loading } = useAuth()

  if (loading || !user || !user.org_id) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" portal={false} />
  }

  return <HomeDashboard />
}
