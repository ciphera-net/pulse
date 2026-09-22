import type { Receipt } from '@/lib/notifications/types'
import { zoneDayKey, zoneParts, shiftDayKey } from '@/lib/utils/siteTime'

export type DaySection = { key: string; label: string; items: Receipt[] }

/**
 * Day-grouped register sections (round-3 Direction B): time is the primary
 * axis, one section per calendar day, labelled "Today" / "Yesterday" / the
 * date ("26 August"; the year appears only when it differs from the current
 * one). Grouping is by the viewer's DISPLAY-TIMEZONE preference (18-09-2026
 * design §4.3) — `timeZone` optional and additive; omit it and this groups
 * by the runtime's local calendar day exactly as before — a display concern,
 * not a data one; the server owns nothing here.
 *
 * Calendar arithmetic throughout, not 24h subtraction — a DST fall-back day
 * is 25 hours long and a fixed offset mislabels it (review catch). Delegates
 * to siteTime.ts's zone arithmetic, which already carries this guarantee.
 */
export function groupByDay(receipts: Receipt[], timeZone?: string): DaySection[] {
  const now = new Date()
  const todayKey = zoneDayKey(now, timeZone)
  const yesterdayKey = shiftDayKey(todayKey, -1)
  const nowYear = zoneParts(now, timeZone).year

  const sections: DaySection[] = []
  const byKey = new Map<string, DaySection>()

  for (const r of receipts) {
    const when = new Date(r.event.created_at)
    const key = zoneDayKey(when, timeZone)
    let section = byKey.get(key)
    if (!section) {
      let label: string
      if (key === todayKey) label = 'Today'
      else if (key === yesterdayKey) label = 'Yesterday'
      else {
        const p = zoneParts(when, timeZone)
        label = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(timeZone ? { timeZone } : {}) })
        if (p.year !== nowYear) label += ` ${p.year}`
      }
      section = { key, label, items: [] }
      byKey.set(key, section)
      sections.push(section)
    }
    section.items.push(r)
  }
  return sections
}

/**
 * HH:MM in the viewer's display-timezone preference (18-09-2026 design §4.3).
 * `timeZone` optional and additive — omit it and this renders in the runtime's
 * local zone. hourCycle 'h23', not hour12:false — the latter can render
 * midnight as "24". Lived in RegisterRow until 22-09-2026; the page's rows are
 * the bell's rows now and pass this as their time label.
 */
export function hhmm(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (!timeZone) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
}
