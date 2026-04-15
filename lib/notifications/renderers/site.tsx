import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'

export const siteRenderers = {
  site_added: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: `Site added — ${siteName}`,
      body: 'Tracking script is live.',
      linkLabel: 'View site',
    }
  },
  site_tracking_issue: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; issue_code: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: `Tracking script issue — ${siteName}`,
      body: `Issue code: ${p.issue_code}.`,
      linkLabel: 'View diagnostics',
    }
  },
  site_export_ready: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { export_id: string; site_id: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: 'Export ready',
      body: `Your data export for ${siteName} is ready to download.`,
      linkLabel: 'Download',
    }
  },
}
