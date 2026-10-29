import { describe, it, expect } from 'vitest'
import { aggregateJourney } from '../aggregate'
import { buildLinks } from '../chain'
import { layoutSankey } from '../sankeyLayout'
import { DENSITY_OPTIONS } from '@/lib/hooks/useJourneyFilters'
import {
  K,
  canonLinks,
  prng,
  rowsFromSessions,
  serverFlow,
  todaysChart,
  type Row,
} from './flowServer'

// ---------------------------------------------------------------------------
// The bounded flow (GET /journeys/flow: top 50 pages per column, exact totals,
// index-encoded links) re-sliced at every Paths rung draws EXACTLY the chart
// the unbounded /journeys/transitions rows drew: the same columns, the same
// links. Ported from the options round's equivalence.mjs / bounded.mjs, and
// the frontend half of the backend's TestJourneyFlowRedrawsTodaysChartAtEveryPathsRung.
//
// The one intended difference is the step headers: they are now the columns'
// exact totals, and the footer states the (other)→(other) sessions the chart
// does not draw. Both are asserted here against the unbounded rows.
// ---------------------------------------------------------------------------

const DEPTHS = [2, 3, 4, 5, 6]

/**
 * A generated site, built so the cases the bounded route must survive are all
 * present (asserted below, so the fixture cannot quietly stop holding them):
 * column 0 has exactly 51 pages (one past the cut), column 1 exactly 50 (at
 * it), columns 2 and 3 over 50 with tied counts across the cuts; sessions of
 * one to five pages, so a one-page session is in no column and at depth 6 the
 * last column is empty; the same path at different steps; paths with `|`, `:`
 * and non-ASCII characters.
 */
function generatedSessions(seed: number, count = 2400): string[][] {
  const rand = prng(seed)
  const skewed = (n: number) => Math.floor(n * rand() ** 2)
  const special = ['/A', '/a', '/_x', '/-x', '/é', '/！', '/😀', '/a|b', '/c:d']
  const col0 = ['/', ...special, ...Array.from({ length: 51 - 1 - special.length }, (_, i) => `/entry/${i}`)]
  const col1 = Array.from({ length: 50 }, (_, i) => `/second/${i}`)
  const col2 = ['/', '/pricing', ...special, ...Array.from({ length: 59 }, (_, i) => `/third/${i}`)]
  const col3 = Array.from({ length: 64 }, (_, i) => `/fourth/${i}`)
  const col4 = Array.from({ length: 12 }, (_, i) => `/fifth/${i}`)

  const sessions: string[][] = []
  let multi = 0
  for (let s = 0; s < count; s++) {
    const r = s % 10
    const length = r === 0 ? 1 : r <= 3 ? 2 : r <= 6 ? 3 : r <= 8 ? 4 : 5
    if (length === 1) {
      sessions.push([col0[skewed(col0.length)]])
      continue
    }
    // * The first 51 multi-page sessions cover every column-0 and column-1 page.
    const pages = [
      multi < col0.length ? col0[multi] : col0[skewed(col0.length)],
      multi < col1.length ? col1[multi] : col1[skewed(col1.length)],
    ]
    multi++
    if (length >= 3) pages.push(col2[skewed(col2.length)])
    if (length >= 4) pages.push(col3[skewed(col3.length)])
    if (length >= 5) pages.push(col4[skewed(col4.length)])
    sessions.push(pages)
  }
  return sessions
}

/** Every rung of every depth: the client's re-slice against the unbounded chart. */
function assertEquivalent(rows: Row[]) {
  let compared = 0
  for (const depth of DEPTHS) {
    const flow = serverFlow(rows, depth)
    for (const P of DENSITY_OPTIONS) {
      const today = todaysChart(rows, depth, P)
      const columns = aggregateJourney(flow, { maxPagesPerStep: P })
      const { links, undrawnOtherHops } = buildLinks(flow, columns)

      expect(columns, `columns at depth ${depth}, Paths ${P}`).toEqual(today.columns)
      expect(canonLinks(links), `links at depth ${depth}, Paths ${P}`).toEqual(canonLinks(today.links))
      expect(undrawnOtherHops, `undrawn at depth ${depth}, Paths ${P}`).toBe(
        today.undrawnPerHop.reduce((s, n) => s + n, 0),
      )

      // * What the docs say the chart shows: the strips arriving at a step sum
      // * to its header less that hop's undrawn (other)→(other) sessions, and
      // * the footer's total is column 0's.
      for (const col of columns.slice(1)) {
        const arriving = links
          .filter((l) => l.target.startsWith(`${col.index}:`))
          .reduce((s, l) => s + l.value, 0)
        expect(arriving).toBe(col.sessions - today.undrawnPerHop[col.index - 1])
      }
      if (columns.length > 0) expect(flow.total_sessions).toBe(columns[0].sessions)

      // * The layout's headers are those exact totals, whatever is drawn.
      const layout = layoutSankey(flow, { maxPagesPerStep: P, width: 1200 })
      expect(layout.steps.map((s) => s.sessions)).toEqual(columns.map((c) => c.sessions))
      expect(layout.steps.map((s) => s.dropOffPercent)).toEqual(columns.map((c) => c.dropOffPercent))
      expect(layout.undrawnOtherHops).toBe(undrawnOtherHops)
      compared++
    }
  }
  return compared
}

describe('the bounded flow redraws the unbounded chart at every Paths rung', () => {
  const rows = rowsFromSessions(generatedSessions(17))

  it('holds the cases it exists to test', () => {
    const flow6 = serverFlow(rows, 6)
    const [c0, c1, c2, c3, c4, c5] = flow6.columns
    // * exactly 51 and exactly 50 pages: one past the cut, and at it
    expect(c0.pages).toBe(K + 1)
    expect(c0.top).toHaveLength(K)
    expect(c0.other_pages).toBe(1)
    expect(c1.pages).toBe(K)
    expect(c1.other_pages).toBe(0)
    // * over the cut, with (other) carrying sessions the top does not
    expect(c2.pages).toBeGreaterThan(K)
    expect(c3.pages).toBeGreaterThan(K)
    expect(c2.other_sessions).toBeGreaterThan(0)
    // * depth 6's last column is empty, and still sent as zeros
    expect(c4.total_sessions).toBeGreaterThan(0)
    expect(c5).toEqual({ total_sessions: 0, pages: 0, top: [], other_sessions: 0, other_pages: 0 })
    // * one-page sessions are in no column: column 0 counts sessions with a hop
    const sessions = generatedSessions(17)
    expect(flow6.total_sessions).toBe(sessions.filter((s) => s.length >= 2).length)
    expect(flow6.total_sessions).toBeLessThan(sessions.length)
    // * ties straddle a Paths cut in some column (rank order then decides)
    const tiedAtCut = flow6.columns.some((col) =>
      DENSITY_OPTIONS.some((P) => P < col.top.length && col.top[P - 1][1] === col.top[P][1]),
    )
    expect(tiedAtCut).toBe(true)
    // * a link with −1 on each side alone, and on both
    expect(flow6.links.some(([, f, t]) => f === -1 && t >= 0)).toBe(true)
    expect(flow6.links.some(([, f, t]) => f >= 0 && t === -1)).toBe(true)
    expect(flow6.links.some(([, f, t]) => f === -1 && t === -1)).toBe(true)
    // * only drawn hops are sent
    expect(Math.max(...flow6.links.map(([hop]) => hop))).toBeLessThanOrEqual(6 - 2)
    // * at Paths 5 the chart leaves (other)→(other) sessions undrawn
    const cols5 = aggregateJourney(flow6, { maxPagesPerStep: 5 })
    expect(buildLinks(flow6, cols5).undrawnOtherHops).toBeGreaterThan(0)
  })

  it('trims the empty last column at depth 6 and keeps all five at depth 5', () => {
    expect(aggregateJourney(serverFlow(rows, 6), { maxPagesPerStep: 20 })).toHaveLength(5)
    expect(aggregateJourney(serverFlow(rows, 5), { maxPagesPerStep: 20 })).toHaveLength(5)
  })

  it('equals the unbounded chart at depth 2–6 × Paths 5/10/20/50', () => {
    expect(assertEquivalent(rows)).toBe(DEPTHS.length * DENSITY_OPTIONS.length)
  })

  // * One test per site, so each has its own time budget on a loaded runner.
  it.each([1, 2, 3, 4, 5])('equals it on another generated site too (seed %i)', (seed) => {
    expect(assertEquivalent(rowsFromSessions(generatedSessions(seed, 1200)))).toBe(
      DEPTHS.length * DENSITY_OPTIONS.length,
    )
  })

  it('draws nothing for an empty range, as the unbounded rows did', () => {
    for (const depth of DEPTHS) {
      const flow = serverFlow([], depth)
      expect(flow).toEqual({
        depth,
        total_sessions: 0,
        columns: Array.from({ length: depth }, () => ({ total_sessions: 0, pages: 0, top: [], other_sessions: 0, other_pages: 0 })),
        links: [],
      })
      for (const P of DENSITY_OPTIONS) {
        const columns = aggregateJourney(flow, { maxPagesPerStep: P })
        expect(columns).toEqual([])
        expect(buildLinks(flow, columns)).toEqual({ links: [], undrawnOtherHops: 0 })
        expect(layoutSankey(flow, { maxPagesPerStep: P, width: 1200 }).nodes).toEqual([])
        expect(todaysChart([], depth, P).columns).toEqual([])
      }
    }
  })
})
