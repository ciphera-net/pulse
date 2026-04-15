import type { Receipt } from '@/lib/notifications/types'
import type { Rendered } from './index'

export const systemRenderers = {
  system_announcement: (r: Receipt): Rendered => {
    const p = r.event.payload as { announcement_id: string }
    return {
      title: 'Announcement',
      body: `Announcement #${p.announcement_id}.`,
      linkLabel: 'See release notes',
    }
  },
  system_maintenance: (r: Receipt): Rendered => {
    const p = r.event.payload as { starts_at: string; ends_at: string }
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('en', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    return {
      title: `Scheduled maintenance ${fmt(p.starts_at)}`,
      body: `${fmt(p.starts_at)} – ${fmt(p.ends_at)}.`,
      linkLabel: null,
    }
  },
}
