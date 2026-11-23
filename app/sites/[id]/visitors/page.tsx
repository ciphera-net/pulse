'use client'

import { useParams } from 'next/navigation'
import VisitorsListPage from '@/components/visitors/list/VisitorsListPage'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'

/**
 * The Visitors page: every visitor in one list in the dashboard's frame (components/visitors/list/VisitorsListPage.tsx).
 * It was a beta from 20-11-2026 (flag `new-visitors`) and went to every team on 23-11-2026; the roster it replaced is
 * gone. A member's page only: no public scope serves visitor-level data.
 */
export default function VisitorsPage() {
  const params = useParams()
  const siteId = params.id as string
  return (
    <DashboardFrameProvider>
      <VisitorsListPage siteId={siteId} />
    </DashboardFrameProvider>
  )
}
