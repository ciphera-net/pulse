/**
 * The copy deck's one time format (§2): "just now", "27 min ago", "3 h ago", "2 days ago", and a short date, "3 Nov".
 * Instants render in the viewer's display zone (`useDisplayZone().zone`, already sanitised), like every stamp in
 * settings.
 */

// From a fixed table: Intl's en-GB writes September as "Sept" (copy deck §9.11.10).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayParts(d: Date, timeZone: string): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { day: get('day'), month: get('month'), year: get('year') }
}

/** "3 Nov"; "11 Sep 2027" when the year is not this one, so next September never reads as this one (§11.6, 3). */
export function shortDate(iso: string, timeZone: string, now: Date = new Date()): string {
  const d = dayParts(new Date(iso), timeZone)
  const year = d.year !== dayParts(now, timeZone).year ? ` ${d.year}` : ''
  return `${d.day} ${MONTHS[d.month - 1]}${year}`
}

/** "just now", "27 min ago", "3 h ago", "9 days ago"; after a month, the date: "on 3 Nov". */
export function ago(iso: string, timeZone: string, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const days = Math.floor(s / 86400)
  return days < 31 ? `${days} ${days === 1 ? 'day' : 'days'} ago` : `on ${shortDate(iso, timeZone, now)}`
}

/** "All sites", "1 site", "3 sites": what a key or an assistant can read. */
export function sitesWord(all: boolean, siteIds: string[]): string {
  if (all) return 'All sites'
  return `${siteIds.length} ${siteIds.length === 1 ? 'site' : 'sites'}`
}
