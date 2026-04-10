import type { PathTransition } from '@/lib/api/journeys'

export interface AggregatedPage {
  path: string
  sessionCount: number
  isOther: boolean
}

export interface AggregatedStep {
  index: number
  visitors: number
  dropOffPercent: number
  pages: AggregatedPage[]
}

export interface AggregateOptions {
  depth: number
  maxPagesPerStep: number
}

/**
 * * Transforms raw PathTransition[] into step-keyed aggregated data
 * * consumed by both ColumnJourney and SankeyJourney views.
 *
 * * Step 0 uses from_path of transitions at step_index 0 (entry pages).
 * * Step k > 0 uses to_path of transitions at step_index = k - 1.
 * * Pages beyond maxPagesPerStep roll into an "(other)" bucket.
 * * Trailing empty steps are trimmed.
 */
export function aggregateJourney(
  transitions: PathTransition[],
  opts: AggregateOptions,
): AggregatedStep[] {
  if (transitions.length === 0) return []

  const { depth, maxPagesPerStep } = opts
  const steps: AggregatedStep[] = []

  for (let stepIdx = 0; stepIdx < depth; stepIdx++) {
    const pageMap = new Map<string, number>()

    if (stepIdx === 0) {
      for (const t of transitions) {
        if (t.step_index === 0) {
          pageMap.set(t.from_path, (pageMap.get(t.from_path) ?? 0) + t.session_count)
        }
      }
    } else {
      for (const t of transitions) {
        if (t.step_index === stepIdx - 1) {
          pageMap.set(t.to_path, (pageMap.get(t.to_path) ?? 0) + t.session_count)
        }
      }
    }

    const sorted = Array.from(pageMap.entries())
      .map(([path, sessionCount]) => ({ path, sessionCount, isOther: false }))
      .sort((a, b) => b.sessionCount - a.sessionCount)

    let pages: AggregatedPage[]
    if (sorted.length > maxPagesPerStep) {
      const kept = sorted.slice(0, maxPagesPerStep)
      const otherCount = sorted
        .slice(maxPagesPerStep)
        .reduce((sum, p) => sum + p.sessionCount, 0)
      kept.push({ path: '(other)', sessionCount: otherCount, isOther: true })
      pages = kept
    } else {
      pages = sorted
    }

    const visitors = pages.reduce((sum, p) => sum + p.sessionCount, 0)
    const prevVisitors = stepIdx > 0 ? steps[stepIdx - 1].visitors : visitors
    const dropOffPercent =
      stepIdx === 0 || prevVisitors === 0
        ? 0
        : Math.round(((visitors - prevVisitors) / prevVisitors) * 100)

    steps.push({ index: stepIdx, visitors, dropOffPercent, pages })
  }

  // * Trim empty trailing steps
  while (steps.length > 1 && steps[steps.length - 1].pages.length === 0) {
    steps.pop()
  }

  // * If all steps are empty (defensive)
  if (steps.length === 1 && steps[0].pages.length === 0) return []

  return steps
}
