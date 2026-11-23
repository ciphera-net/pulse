'use client'

import JourneysFlowPage from '@/components/journeys/flow/JourneysFlowPage'
import { NotShared } from '@/components/public/states'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import { servesPage, useSiteScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// The Journeys page (R87 to R96): the flow in the dashboard's frame (components/journeys/flow/
// JourneysFlowPage.tsx), for a member and for every public scope that serves the page (the demo; a public view reads
// only, so the funnel action is a member's). It was a beta from 18-11-2026 (flag `new-journeys`) and went to every
// team on 23-11-2026; the page it replaced is gone. A scope that does not serve the page says so and reads nothing.
// ---------------------------------------------------------------------------

export default function JourneysSurface() {
  const scope = useSiteScope()
  if (!servesPage(scope, 'journeys')) return <NotShared scope={scope} />
  return (
    <DashboardFrameProvider>
      <JourneysFlowPage siteId={scope.siteId} />
    </DashboardFrameProvider>
  )
}
