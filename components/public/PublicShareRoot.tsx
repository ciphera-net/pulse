'use client'

import { PublicRoot } from '@/components/public/PublicRoot'
import { usePublicView } from '@/components/public/usePublicView'

/**
 * /share/<id> and every page under it (PUL-34): a site's public link. The site is the one
 * the link names; which of its pages the link serves is read from the site's public view,
 * and a link whose view is not served (a customer's, today) shows the dashboard.
 */
export default function PublicShareRoot({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  const { state, retry } = usePublicView({ kind: 'share', siteId })
  return (
    <PublicRoot state={state} basePath={`/share/${encodeURIComponent(siteId)}`} retry={retry}>
      {children}
    </PublicRoot>
  )
}
