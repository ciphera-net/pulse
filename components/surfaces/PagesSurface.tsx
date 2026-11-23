'use client'

import PagesListPage from '@/components/pages/list/PagesListPage'
import { NotShared } from '@/components/public/states'
import { servesPage, useSiteScope } from '@/lib/scope/SiteScope'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'

// ---------------------------------------------------------------------------
// The Pages page: every page of the site as one list in the dashboard's frame
// (components/pages/list/PagesListPage.tsx), for a member and for every public scope that serves the page (the
// demo). It was a beta from 17-11-2026 (flag `new-pages`) and went to every team on 23-11-2026; the table it replaced
// is gone. A scope that does not serve the page (a share link) says so and reads nothing.
// ---------------------------------------------------------------------------

export default function PagesSurface() {
  const scope = useSiteScope()
  if (!servesPage(scope, 'pages')) return <NotShared scope={scope} />
  return (
    <DashboardFrameProvider>
      <PagesListPage siteId={scope.siteId} />
    </DashboardFrameProvider>
  )
}
