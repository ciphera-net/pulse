import { TrendUp, TrendDown } from '@phosphor-icons/react'
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
  site_traffic_spike: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; site_domain: string; current_visitors: number; baseline_visitors: number; change_percent: number }
    const name = resolvers?.resolveSiteName?.(p.site_id) ?? p.site_domain
    return {
      icon: <TrendUp className="w-5 h-5" />,
      title: `Traffic spike on ${name}`,
      body: `Visitors up ${Math.round(p.change_percent)}% vs 7-day average (${p.current_visitors} vs ${p.baseline_visitors}).`,
      linkLabel: 'View dashboard',
    }
  },
  site_traffic_drop: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; site_domain: string; current_visitors: number; baseline_visitors: number; change_percent: number }
    const name = resolvers?.resolveSiteName?.(p.site_id) ?? p.site_domain
    return {
      icon: <TrendDown className="w-5 h-5" />,
      title: `Traffic drop on ${name}`,
      body: `Visitors down ${Math.abs(Math.round(p.change_percent))}% vs 7-day average (${p.current_visitors} vs ${p.baseline_visitors}).`,
      linkLabel: 'View dashboard',
    }
  },
}
