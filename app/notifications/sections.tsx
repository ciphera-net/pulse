import type { Receipt } from '@/lib/notifications/types'

export type DaySection = { key: string; label: string; items: Receipt[] }

/**
 * Day-grouped register sections (round-3 Direction B): time is the primary
 * axis, one section per calendar day, labelled "Today" / "Yesterday" / the
 * date ("26 August"; the year appears only when it differs from the current
 * one). Grouping is by the viewer's local calendar day of event.created_at —
 * a display concern, not a data one; the server owns nothing here.
 */
export function groupByDay(receipts: Receipt[]): DaySection[] {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const todayStart = startOfDay(now).getTime()
  // Calendar arithmetic, not 24h subtraction — a DST fall-back day is 25
  // hours long and a fixed offset mislabels it (review catch).
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()

  const sections: DaySection[] = []
  const byKey = new Map<string, DaySection>()

  for (const r of receipts) {
    const when = new Date(r.event.created_at)
    const dayStart = startOfDay(when)
    const key = `${dayStart.getFullYear()}-${dayStart.getMonth()}-${dayStart.getDate()}`
    let section = byKey.get(key)
    if (!section) {
      let label: string
      const t = dayStart.getTime()
      if (t >= todayStart) label = 'Today'
      else if (t >= yesterdayStart) label = 'Yesterday'
      else {
        label = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
        if (when.getFullYear() !== now.getFullYear()) label += ` ${when.getFullYear()}`
      }
      section = { key, label, items: [] }
      byKey.set(key, section)
      sections.push(section)
    }
    section.items.push(r)
  }
  return sections
}
