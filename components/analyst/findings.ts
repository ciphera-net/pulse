import type { AnalystConversation, AnalystFinding, AnalystFindingSummary, AnalystOutcome } from '@/lib/api/analyst'
import { formatNumber } from '@/lib/utils/format'
import { zoneParts } from '@/lib/utils/siteTime'

// * The changes Analyst's weekly watcher noticed (PUL-78, design Pulse/docs/plans/14-11-2026-analyst-watchers-design.md
// * §12; owner picks 14-11-2026: A1, a list under the suggestions, and O2, the opened change under a heading). The words
// * on this page passed the humanizer rules, and every figure is one the watcher measured.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Visitors fell 58%" or "Visitors rose 41%": the change against a usual week, whole. */
export function findingTitle(f: Pick<AnalystFindingSummary, 'direction' | 'change'>): string {
  return `Visitors ${f.direction === 'rise' ? 'rose' : 'fell'} ${Math.round(Math.abs(f.change) * 100)}%`
}

/** "72 against a usual 172". The usual level is a median and may end in .5; it is shown whole, as in the question. */
export function findingFigures(f: Pick<AnalystFindingSummary, 'visitors' | 'usual'>): string {
  return `${formatNumber(f.visitors)} against a usual ${formatNumber(Math.round(f.usual))}`
}

/**
 * "26 October", with the year when it is not this year: the week's Monday is a calendar date of the site's, read as
 * written (no time zone moves it).
 */
export function findingWeekDate(week: string, now: Date = new Date()): string {
  const [y, m, d] = week.split('-').map(Number)
  if (!y || !m || !d) return week
  const label = `${d} ${MONTHS[m - 1]}`
  return y === now.getUTCFullYear() ? label : `${label} ${y}`
}

/** "Week of 26 October": the label at the end of a list row. */
export function findingWeekLabel(week: string, now: Date = new Date()): string {
  return `Week of ${findingWeekDate(week, now)}`
}

/** "Visitors fell 58% in the week of 26 October": the heading of the opened change. */
export function findingHeading(f: Pick<AnalystFindingSummary, 'direction' | 'change' | 'week'>, now: Date = new Date()): string {
  return `${findingTitle(f)} in the week of ${findingWeekDate(f.week, now)}`
}

/** "Noticed by Analyst on 2 November", the day in the zone the person reads times in. */
export function findingNoticed(createdAt: string, zone: string, now: Date = new Date()): string {
  const at = new Date(createdAt)
  if (Number.isNaN(at.getTime())) return 'Noticed by Analyst'
  const p = zoneParts(at, zone)
  const label = `${p.day} ${MONTHS[p.month - 1]}`
  return `Noticed by Analyst on ${p.year === zoneParts(now, zone).year ? label : `${label} ${p.year}`}`
}

/**
 * The finding as a chat of one turn, so the page draws it as any answer: its question as a heading (asked_by_analyst),
 * its explanation with the lookups behind it and the questions to ask next. A finding still being written or one that
 * could not be written shows its own sentence (OUTCOME_TEXT's pending and finding_error).
 */
export function findingConversation(f: AnalystFinding): AnalystConversation {
  const outcome = (
    f.outcome === 'pending' ? 'pending' : f.outcome === 'error' ? 'finding_error' : f.outcome
  ) as AnalystOutcome
  return {
    id: `finding-${f.id}`,
    started_at: f.created_at,
    turns: [
      {
        id: f.id,
        conversation_id: '',
        site_id: f.site_id,
        question: f.question,
        answer: f.outcome === 'answered' ? f.answer : null,
        outcome,
        steps: f.steps,
        follow_ups: f.outcome === 'answered' ? (f.follow_ups ?? null) : null,
        asked_by_analyst: true,
        created_at: f.created_at,
      },
    ],
  }
}
