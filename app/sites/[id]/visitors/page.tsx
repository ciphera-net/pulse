'use client'

import { useParams } from 'next/navigation'
import VisitorsRoster from '@/components/visitors/VisitorsRoster'
import VisitorsListPage from '@/components/visitors/list/VisitorsListPage'
import { NEW_VISITORS_FLAG } from '@/components/visitors/list/flag'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import { useFeature } from '@/lib/features'
import { SkeletonBar } from '@/components/skeletons'

/**
 * The new Visitors page is in beta (`new-visitors`, lib/betas.ts): a team that has it gets the list in the dashboard's
 * frame (components/visitors/list/VisitorsListPage.tsx), every other team keeps today's roster. While /me is on the way
 * the answer is not known, and NEITHER page is drawn: a team in the beta never sees the roster flash by, and no read is
 * made for a page that is about to be replaced (the Pages page's gate, components/surfaces/PagesSurface.tsx).
 */
export default function VisitorsPage() {
  const params = useParams()
  const siteId = params.id as string
  const list = useFeature(NEW_VISITORS_FLAG)
  if (list === null) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6" aria-hidden="true" data-visitors-gate="waiting">
        <SkeletonBar className="h-96 animate-pulse rounded-none border border-border bg-card" />
      </div>
    )
  }
  if (list) {
    return (
      <DashboardFrameProvider>
        <VisitorsListPage siteId={siteId} />
      </DashboardFrameProvider>
    )
  }
  return <VisitorsRoster />
}
