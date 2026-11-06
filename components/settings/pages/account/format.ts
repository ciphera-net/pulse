import { formatSiteTime, shiftDayKey, zoneDayKey, zoneParts } from '@/lib/utils/siteTime'

// One time format everywhere in settings (copy deck §2): just now, 27 min ago, 3 h ago, 2 days ago, 3 Nov.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "3 Nov", or "3 Nov 2025" outside the current year, on the viewer's calendar. */
export function dayLabel(iso: string, zone: string, now: Date = new Date()): string {
  const p = zoneParts(new Date(iso), zone)
  const label = `${p.day} ${MONTHS[p.month - 1]}`
  return p.year !== zoneParts(now, zone).year ? `${label} ${p.year}` : label
}

/** "27 min ago", "3 h ago", "2 days ago", then "on 3 Nov" past a month. */
export function agoLabel(iso: string, zone: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d < 31 ? `${d} ${d === 1 ? 'day' : 'days'} ago` : `on ${dayLabel(iso, zone, new Date(now))}`
}

/** Today · Yesterday · 3 Nov: the security activity's day groups, in calendar days (a DST day keeps its label). */
export function dayGroupLabel(iso: string, zone: string, now: Date = new Date()): string {
  const key = zoneDayKey(new Date(iso), zone)
  const today = zoneDayKey(now, zone)
  if (key === today) return 'Today'
  if (key === shiftDayKey(today, -1)) return 'Yesterday'
  return dayLabel(iso, zone, now)
}

export function dayKey(iso: string, zone: string): string {
  return zoneDayKey(new Date(iso), zone)
}

/** "14:30" in the viewer's zone. */
export function timeLabel(iso: string, zone: string): string {
  return formatSiteTime(iso, zone)
}

/**
 * How long a confirmation link has left, from the server's absolute horizon, so a tab left open does not keep
 * promising the minutes it had when it loaded.
 */
export function expiryPhrase(expiresAt: string | null, now: number): string {
  if (!expiresAt) return 'It expires 30 min after it was sent.'
  const ms = Date.parse(expiresAt) - now
  if (Number.isNaN(ms)) return 'It expires 30 min after it was sent.'
  if (ms <= 0) return 'It may have expired.'
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'It expires in under a minute.'
  return `It expires in about ${minutes} min.`
}
