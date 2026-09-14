import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'
import { formatDowntime, daysUntil } from '../display-utils'
import { formatDateTime } from '@/lib/utils/formatDate'

export const uptimeRenderers = {
  uptime_monitor_down: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { monitor_id: string; site_id: string; status_code: number }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: `Monitor down — ${siteName}`,
      body: `Status code ${p.status_code}.`,
      linkLabel: 'View monitor',
    }
  },
  uptime_monitor_recovered: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { monitor_id: string; site_id: string; downtime_seconds: number }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: `Monitor recovered — ${siteName}`,
      body: `Back online after ${formatDowntime(p.downtime_seconds)}.`,
      linkLabel: 'View monitor',
    }
  },
  uptime_ssl_expiring: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { monitor_id: string; site_id: string; expires_at: string }
    const days = daysUntil(p.expires_at)
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: `SSL expiring in ${days} days`,
      body: `Renew the certificate for ${siteName}.`,
      linkLabel: 'View monitor',
    }
  },
  // iris migration 027 — the install watchers. Same shape as the monitor pair:
  // the alarm names the site and states a fact; the recovery states the length
  // of the episode from the payload, never from now().
  site_install_silent: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; last_event_at: string; domain?: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : (p.domain ?? `site ${p.site_id}`)
    const at = new Date(p.last_event_at)
    const since = Number.isNaN(at.getTime()) ? null : formatDateTime(at)
    return {
      title: `Tracking script went quiet — ${siteName}`,
      body: since ? `No events since ${since}.` : 'Events have stopped arriving.',
      linkLabel: 'View site',
    }
  },
  site_install_recovered: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; silent_seconds: number; domain?: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : (p.domain ?? `site ${p.site_id}`)
    return {
      title: `Tracking script is back — ${siteName}`,
      body: `Events are arriving again after ${formatDowntime(p.silent_seconds)}.`,
      linkLabel: 'View site',
    }
  },
}
