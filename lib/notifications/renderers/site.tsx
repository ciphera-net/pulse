import type { Receipt } from '@/lib/notifications/types'
import type { Rendered } from './index'

export const siteRenderers = {
  site_added: (r: Receipt): Rendered => {
    const p = r.event.payload as { site_id: string }
    return {
      // TODO(3.4): use resolveSiteName(p.site_id) instead of bare ID
      title: `Site added — site ${p.site_id}`,
      body: 'Tracking script is live.',
      linkLabel: 'View site',
    }
  },
  site_tracking_issue: (r: Receipt): Rendered => {
    const p = r.event.payload as { site_id: string; issue_code: string }
    return {
      // TODO(3.4): use resolveSiteName(p.site_id) instead of bare ID
      title: `Tracking script issue — site ${p.site_id}`,
      body: `Issue code: ${p.issue_code}.`,
      linkLabel: 'View diagnostics',
    }
  },
  site_export_ready: (r: Receipt): Rendered => {
    const p = r.event.payload as { export_id: string; site_id: string }
    return {
      title: 'Export ready',
      body: `Your data export for site ${p.site_id} is ready to download.`,
      linkLabel: 'Download',
    }
  },
}
