import { describe, it, expect } from 'vitest'
import { aggregateJourney } from '../aggregate'
import type { JourneyFlow, JourneyFlowColumn, JourneyFlowPage } from '@/lib/api/journeys'

/** A column as the server sends it: exact totals, the top in rank order, the rest as (other). */
const col = (top: JourneyFlowPage[], otherSessions = 0, otherPages = 0): JourneyFlowColumn => ({
  total_sessions: top.reduce((s, [, n]) => s + n, 0) + otherSessions,
  pages: top.length + otherPages,
  top,
  other_sessions: otherSessions,
  other_pages: otherPages,
})
const EMPTY_COL = col([])

const flowOf = (columns: JourneyFlowColumn[]): JourneyFlow => ({
  depth: columns.length,
  total_sessions: columns[0]?.total_sessions ?? 0,
  columns,
  links: [],
})

// The response §12.9 of the design shows (paths made up, each top shortened).
const SPEC_FLOW = flowOf([
  col([['/', 180], ['/blog/hello-world', 41]], 9, 7),
  col([['/pricing', 120], ['/docs', 95]], 0, 0),
  col([['/signup', 88], ['/docs/install', 31]], 0, 0),
])

describe('aggregateJourney (re-slicing the server flow)', () => {
  it('returns no columns for an empty range', () => {
    expect(aggregateJourney(flowOf([EMPTY_COL, EMPTY_COL, EMPTY_COL, EMPTY_COL]), { maxPagesPerStep: 20 })).toEqual([])
    expect(aggregateJourney({ depth: 0, total_sessions: 0, columns: [], links: [] }, { maxPagesPerStep: 20 })).toEqual([])
  })

  it('names the top pages in the order received and seeds (other) from the server', () => {
    const [c0, c1] = aggregateJourney(SPEC_FLOW, { maxPagesPerStep: 20 })
    expect(c0.pages).toEqual([
      { path: '/', sessionCount: 180, isOther: false },
      { path: '/blog/hello-world', sessionCount: 41, isOther: false },
      { path: '(other)', sessionCount: 9, isOther: true },
    ])
    // * a column whose pages all fit has no (other) row
    expect(c1.pages.some((p) => p.isOther)).toBe(false)
  })

  it('header totals are the columns\' exact totals, drop-off from those', () => {
    const steps = aggregateJourney(SPEC_FLOW, { maxPagesPerStep: 20 })
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2])
    expect(steps.map((s) => s.sessions)).toEqual([230, 215, 119])
    expect(steps.map((s) => s.dropOffPercent)).toEqual([
      0,
      Math.round(((215 - 230) / 230) * 100),
      Math.round(((119 - 215) / 215) * 100),
    ])
  })

  it('takes total_sessions as sent, not a sum it recomputes', () => {
    const c = col([['/a', 5]], 2, 1)
    const steps = aggregateJourney(flowOf([{ ...c, total_sessions: 7 }, col([['/b', 7]])]), { maxPagesPerStep: 1 })
    expect(steps[0].sessions).toBe(7)
  })

  it('folds the top beyond Paths into (other) with the server\'s own (other)', () => {
    const flow = flowOf([col([['/a', 10], ['/b', 8], ['/c', 5], ['/d', 3]], 4, 2), col([['/x', 30]])])
    const [c0] = aggregateJourney(flow, { maxPagesPerStep: 2 })
    expect(c0.pages).toEqual([
      { path: '/a', sessionCount: 10, isOther: false },
      { path: '/b', sessionCount: 8, isOther: false },
      { path: '(other)', sessionCount: 5 + 3 + 4, isOther: true },
    ])
    expect(c0.sessions).toBe(30)
  })

  it('adds (other) when only the cut folds pages, and when only the server folded them', () => {
    const onlyCut = aggregateJourney(flowOf([col([['/a', 2], ['/b', 1]]), col([['/x', 3]])]), { maxPagesPerStep: 1 })
    expect(onlyCut[0].pages.at(-1)).toEqual({ path: '(other)', sessionCount: 1, isOther: true })
    const onlyServer = aggregateJourney(flowOf([col([['/a', 2]], 3, 2), col([['/x', 5]])]), { maxPagesPerStep: 5 })
    expect(onlyServer[0].pages.at(-1)).toEqual({ path: '(other)', sessionCount: 3, isOther: true })
  })

  it('never re-sorts: a tie at the cut keeps the server\'s byte order, not JavaScript\'s', () => {
    // * U+FF01 (UTF-8 EF BC 81) sorts before U+1F600 (F0 9F 98 80) by bytes, which is
    // * the server's order; JavaScript's < compares UTF-16 code units and puts the
    // * emoji (a D83D surrogate) first. The first page received must be the one named.
    expect('/😀' < '/！').toBe(true)
    const flow = flowOf([col([['/！', 5], ['/😀', 5]]), col([['/x', 10]])])
    const [c0] = aggregateJourney(flow, { maxPagesPerStep: 1 })
    expect(c0.pages[0].path).toBe('/！')
    expect(c0.pages[1]).toEqual({ path: '(other)', sessionCount: 5, isOther: true })
  })

  it('a column with exactly 50 pages has no (other) at Paths 50; 51 pages has one of one page', () => {
    const fifty = Array.from({ length: 50 }, (_, i): JourneyFlowPage => [`/p${i}`, 100 - i])
    const at50 = aggregateJourney(flowOf([col(fifty), col([['/x', 1]])]), { maxPagesPerStep: 50 })
    expect(at50[0].pages).toHaveLength(50)
    expect(at50[0].pages.some((p) => p.isOther)).toBe(false)
    const at51 = aggregateJourney(flowOf([col(fifty, 1, 1), col([['/x', 1]])]), { maxPagesPerStep: 50 })
    expect(at51[0].pages).toHaveLength(51)
    expect(at51[0].pages[50]).toEqual({ path: '(other)', sessionCount: 1, isOther: true })
  })

  it('trims empty trailing columns, keeping the ones sessions reached', () => {
    const flow = flowOf([col([['/', 10]]), col([['/a', 10]]), col([['/b', 4]]), EMPTY_COL, EMPTY_COL])
    const steps = aggregateJourney(flow, { maxPagesPerStep: 20 })
    expect(steps).toHaveLength(3)
    expect(steps[2].dropOffPercent).toBe(-60)
  })

  it('drop-off is 0 at step 1', () => {
    const steps = aggregateJourney(SPEC_FLOW, { maxPagesPerStep: 20 })
    expect(steps[0].dropOffPercent).toBe(0)
  })
})
