import type { JourneyFlow } from '@/lib/api/journeys'

/** The row a column's pages beyond the Paths limit roll into. */
export const OTHER_PATH = '(other)'

export interface AggregatedPage {
  path: string
  sessionCount: number
  isOther: boolean
}

export interface AggregatedStep {
  index: number
  /** The column's exact session total, as the server counted it: (other) included. */
  sessions: number
  dropOffPercent: number
  pages: AggregatedPage[]
}

export interface AggregateOptions {
  /** Paths: the named pages each column keeps before the rest roll into (other). */
  maxPagesPerStep: number
}

/**
 * The chart's columns at one Paths value, re-sliced from the bounded flow the
 * server sends (GET /journeys/flow). Column c is where sessions were at step
 * c + 1: c = 0 is hop 0's from-page, c ≥ 1 is hop c − 1's to-page.
 *
 * * Each column names the first `maxPagesPerStep` pages of its `top` IN THE
 * * ORDER RECEIVED. The server ranks by sessions, then path in byte order, and
 * * that order is the contract: re-sorting here could swap tied pages at the
 * * cut, because JavaScript compares strings by UTF-16 code unit.
 * * The rest of `top` and the server's own (other) fold into one (other) row,
 * * present whenever that row holds at least one page.
 * * `sessions` is the column's exact total and drop-off is computed from those
 * * totals, so a step header never loses the sessions on an (other)→(other)
 * * hop the chart does not draw.
 * * Trailing empty columns are trimmed; a flow with no sessions is [].
 */
export function aggregateJourney(flow: JourneyFlow, opts: AggregateOptions): AggregatedStep[] {
  const { maxPagesPerStep } = opts
  const steps: AggregatedStep[] = []

  flow.columns.forEach((col, stepIdx) => {
    const top = col.top ?? []
    const named = top.slice(0, maxPagesPerStep)
    const folded = top.slice(maxPagesPerStep)

    const pages: AggregatedPage[] = named.map(([path, sessionCount]) => ({
      path,
      sessionCount,
      isOther: false,
    }))
    if (col.other_pages + folded.length > 0) {
      pages.push({
        path: OTHER_PATH,
        sessionCount: col.other_sessions + folded.reduce((sum, [, n]) => sum + n, 0),
        isOther: true,
      })
    }

    const sessions = col.total_sessions
    const prevSessions = stepIdx > 0 ? steps[stepIdx - 1].sessions : sessions
    const dropOffPercent =
      stepIdx === 0 || prevSessions === 0
        ? 0
        : Math.round(((sessions - prevSessions) / prevSessions) * 100)

    steps.push({ index: stepIdx, sessions, dropOffPercent, pages })
  })

  // * Trim empty trailing steps
  while (steps.length > 1 && steps[steps.length - 1].pages.length === 0) {
    steps.pop()
  }

  // * If all steps are empty (an empty range)
  if (steps.length === 1 && steps[0].pages.length === 0) return []

  return steps
}
