import type { Receipt } from '@/lib/notifications/types'
import type { Rendered } from './index'

function formatDowntime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)))
}

export const uptimeRenderers = {
  uptime_monitor_down: (r: Receipt): Rendered => {
    const p = r.event.payload as { monitor_id: string; site_id: string; status_code: number }
    return {
      // TODO(3.4): use resolveSiteName(p.site_id) instead of bare ID
      title: `Monitor down — site ${p.site_id}`,
      body: `Status code ${p.status_code}.`,
      linkLabel: 'View monitor',
    }
  },
  uptime_monitor_recovered: (r: Receipt): Rendered => {
    const p = r.event.payload as { monitor_id: string; site_id: string; downtime_seconds: number }
    return {
      // TODO(3.4): use resolveSiteName(p.site_id)
      title: `Monitor recovered — site ${p.site_id}`,
      body: `Back online after ${formatDowntime(p.downtime_seconds)}.`,
      linkLabel: 'View monitor',
    }
  },
  uptime_ssl_expiring: (r: Receipt): Rendered => {
    const p = r.event.payload as { monitor_id: string; site_id: string; expires_at: string }
    const days = daysUntil(p.expires_at)
    return {
      // TODO(3.4): use resolveSiteName(p.site_id)
      title: `SSL expiring in ${days} days`,
      body: `Renew the certificate for site ${p.site_id}.`,
      linkLabel: 'View monitor',
    }
  },
}
