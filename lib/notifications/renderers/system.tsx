import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'

// These renderers take the announcement's CONTENT from the payload.
//
// Until 29-08-2026 system_announcement read `announcement_id` and rendered
// "Announcement #<id>." — a reference to a record that has no home anywhere in
// the estate, so even a well-formed id produced a notification saying nothing.
// In practice the code was unreachable: Warden posts {title, body}, and the
// backend validator rejected that with `json: unknown field "body"` before any
// receipt was created, so the broadcast reached nobody while reporting success.
// The payload now carries the words themselves.
//
// Formatting is defensive because the window is optional (see below) and an
// unparseable date must never reach the reader as the string "Invalid Date".
function formatWindow(startsAt?: string, endsAt?: string): string | null {
  if (!startsAt || !endsAt) return null
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const fmt = (d: Date) =>
    d.toLocaleString('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  return `${fmt(start)} – ${fmt(end)}`
}

export const systemRenderers = {
  system_announcement: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { title?: string; body?: string }
    return {
      title: p.title?.trim() || 'Announcement',
      body: p.body?.trim() ?? '',
      // `linkLabel: 'See release notes'` lived here and had never rendered:
      // the broadcast handler passes nil for both link_url and link_label_key,
      // and NotificationRow only draws a link when linkUrl is set.
      linkLabel: null,
    }
  },

  // The composer collects no dates today, so starts_at/ends_at are optional and
  // this must stay readable without them. Formatting an absent window put the
  // literal "Invalid Date" in the title before 29-08-2026.
  system_maintenance: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as {
      title?: string
      body?: string
      starts_at?: string
      ends_at?: string
    }
    const window = formatWindow(p.starts_at, p.ends_at)
    const title = p.title?.trim() || 'Scheduled maintenance'
    const body = [p.body?.trim(), window ? `${window}.` : null].filter(Boolean).join(' ')
    return {
      title: window && !p.title?.trim() ? `${title} ${window}` : title,
      body,
      linkLabel: null,
    }
  },
}
