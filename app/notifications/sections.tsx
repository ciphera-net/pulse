import type { Receipt } from '@/lib/notifications/types'

export type Section = { label: string; items: Receipt[] }

/** Groups receipts into Today / Yesterday / Earlier sections by event.created_at. */
export function groupByRecency(receipts: Receipt[]): Section[] {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const todayStart = startOfDay(now)
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600 * 1000)

  const today: Receipt[] = []
  const yesterday: Receipt[] = []
  const earlier: Receipt[] = []

  for (const r of receipts) {
    const when = new Date(r.event.created_at)
    if (when >= todayStart) today.push(r)
    else if (when >= yesterdayStart) yesterday.push(r)
    else earlier.push(r)
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Earlier', items: earlier },
  ].filter(s => s.items.length > 0)
}
