import type { JourneyFlow, JourneyFlowColumn, JourneyFlowLink } from '@/lib/api/journeys'

// ---------------------------------------------------------------------------
// Test-only ports for the Journeys re-slice tests (not product code; this
// directory is excluded from the product-source scans).
//
//  - `rowsFromSessions`: the producer's derivation. Hop i of a session is
//    pages[i] → pages[i+1], so a one-page session yields no row at all.
//  - `serverFlow`: the GET /journeys/flow contract over those rows. Per column,
//    exact totals counted before the cut, the top K (50) pages ranked sessions
//    DESC then path in BYTE order; links for hops 0 … depth − 2 only, index
//    encoded, −1 for (other), (other)→(other) included.
//  - `todaysChart`: what the chart drew before the bounded route — a port of
//    the pre-flow lib/journeys/aggregate.ts + chain.ts `buildLinks` over the
//    UNBOUNDED rows (hops 0 … depth − 1, as /journeys/transitions sent them),
//    with the one patch the bounded route pins: ties broken by path in byte
//    order instead of by response row order. Its step totals are the columns'
//    page sums (the exact totals), and it also counts the (other)→(other)
//    sessions it does not draw.
//
// The re-slice of `serverFlow` must equal `todaysChart` at every Paths rung:
// the bounded response draws exactly what the unbounded one did.
// ---------------------------------------------------------------------------

export interface Row {
  step_index: number
  from_path: string
  to_path: string
  session_count: number
}

export const K = 50
const OTHER = '(other)'

/** Hop rows from page sequences, summed per (step, from, to). */
export function rowsFromSessions(sessions: string[][]): Row[] {
  const byKey = new Map<string, Row>()
  for (const pages of sessions) {
    for (let h = 0; h + 1 < pages.length; h++) {
      const key = `${h}\u0000${pages[h]}\u0000${pages[h + 1]}`
      const row = byKey.get(key)
      if (row) row.session_count++
      else byKey.set(key, { step_index: h, from_path: pages[h], to_path: pages[h + 1], session_count: 1 })
    }
  }
  return [...byKey.values()]
}

const utf8 = new TextEncoder()

/** Byte order of the UTF-8 encodings: the server's tie-break (Go, COLLATE "C", ClickHouse String). */
export function byteCompare(a: string, b: string): number {
  const x = utf8.encode(a)
  const y = utf8.encode(b)
  const n = Math.min(x.length, y.length)
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return x.length - y.length
}

const byRank = (a: [string, number], b: [string, number]) => b[1] - a[1] || byteCompare(a[0], b[0])

/** Each column's pages summed over the rows: column 0 is hop 0's from-page, column c is hop c − 1's to-page. */
function columnPages(rows: Row[], depth: number): Map<string, number>[] {
  const cols = Array.from({ length: depth }, () => new Map<string, number>())
  for (const r of rows) {
    if (r.step_index === 0) cols[0].set(r.from_path, (cols[0].get(r.from_path) ?? 0) + r.session_count)
    const c = r.step_index + 1
    if (c < depth) cols[c].set(r.to_path, (cols[c].get(r.to_path) ?? 0) + r.session_count)
  }
  return cols
}

/** The bounded response the server sends for these rows at this depth. */
export function serverFlow(rows: Row[], depth: number): JourneyFlow {
  const ranked = columnPages(rows, depth).map((m) => [...m].sort(byRank))
  const columns: JourneyFlowColumn[] = ranked.map((pages) => {
    const total = pages.reduce((s, [, n]) => s + n, 0)
    const top = pages.slice(0, K)
    const topSessions = top.reduce((s, [, n]) => s + n, 0)
    return {
      total_sessions: total,
      pages: pages.length,
      top,
      other_sessions: total - topSessions,
      other_pages: pages.length - top.length,
    }
  })
  const index = columns.map((c) => new Map(c.top.map(([p], i) => [p, i])))
  const sums = new Map<string, JourneyFlowLink>()
  for (const r of rows) {
    if (r.step_index > depth - 2) continue // the hop no column draws is never sent
    const f = index[r.step_index].get(r.from_path) ?? -1
    const t = index[r.step_index + 1].get(r.to_path) ?? -1
    const key = `${r.step_index}|${f}|${t}`
    const link = sums.get(key)
    if (link) link[3] += r.session_count
    else sums.set(key, [r.step_index, f, t, r.session_count])
  }
  const links = [...sums.values()].sort((a, b) => a[0] - b[0] || b[3] - a[3] || a[1] - b[1] || a[2] - b[2])
  return { depth, total_sessions: columns[0]?.total_sessions ?? 0, columns, links }
}

export interface ChartColumn {
  index: number
  sessions: number
  dropOffPercent: number
  pages: { path: string; sessionCount: number; isOther: boolean }[]
}
export interface ChartLink {
  source: string
  target: string
  value: number
}

/** The pre-flow chart over the unbounded rows (see the header). */
export function todaysChart(
  allRows: Row[],
  depth: number,
  P: number,
): { columns: ChartColumn[]; links: ChartLink[]; undrawnPerHop: number[] } {
  // * /journeys/transitions returned hops 0 … depth − 1
  const transitions = allRows.filter((t) => t.step_index < depth)
  if (transitions.length === 0) return { columns: [], links: [], undrawnPerHop: [] }

  // * aggregate.ts (pre-flow), tie-break pinned
  const steps: ChartColumn[] = []
  for (let stepIdx = 0; stepIdx < depth; stepIdx++) {
    const pageMap = new Map<string, number>()
    for (const t of transitions) {
      if (stepIdx === 0 && t.step_index === 0) pageMap.set(t.from_path, (pageMap.get(t.from_path) ?? 0) + t.session_count)
      if (stepIdx > 0 && t.step_index === stepIdx - 1) pageMap.set(t.to_path, (pageMap.get(t.to_path) ?? 0) + t.session_count)
    }
    const sorted = [...pageMap].sort(byRank).map(([path, sessionCount]) => ({ path, sessionCount, isOther: false }))
    let pages = sorted
    if (sorted.length > P) {
      const kept = sorted.slice(0, P)
      kept.push({ path: OTHER, sessionCount: sorted.slice(P).reduce((s, p) => s + p.sessionCount, 0), isOther: true })
      pages = kept
    }
    const sessions = pages.reduce((s, p) => s + p.sessionCount, 0)
    const prev = stepIdx > 0 ? steps[stepIdx - 1].sessions : sessions
    const dropOffPercent = stepIdx === 0 || prev === 0 ? 0 : Math.round(((sessions - prev) / prev) * 100)
    steps.push({ index: stepIdx, sessions, dropOffPercent, pages })
  }
  while (steps.length > 1 && steps[steps.length - 1].pages.length === 0) steps.pop()
  if (steps.length === 1 && steps[0].pages.length === 0) return { columns: [], links: [], undrawnPerHop: [] }

  // * chain.ts buildLinks (pre-flow), plus the (other)→(other) sessions it skipped
  const pathsByStep = new Map(steps.map((s) => [s.index, new Set(s.pages.map((p) => p.path))]))
  const linkMap = new Map<string, ChartLink>()
  const undrawnPerHop = Array.from({ length: Math.max(0, steps.length - 1) }, () => 0)
  for (const t of transitions) {
    const fromPaths = pathsByStep.get(t.step_index)
    const toPaths = pathsByStep.get(t.step_index + 1)
    if (!fromPaths || !toPaths) continue
    const fp = fromPaths.has(t.from_path) ? t.from_path : OTHER
    const tp = toPaths.has(t.to_path) ? t.to_path : OTHER
    if (fp === OTHER && tp === OTHER) {
      undrawnPerHop[t.step_index] += t.session_count
      continue
    }
    const source = `${t.step_index}:${fp}`
    const target = `${t.step_index + 1}:${tp}`
    const key = `${source}\u0000${target}`
    const link = linkMap.get(key)
    if (link) link.value += t.session_count
    else linkMap.set(key, { source, target, value: t.session_count })
  }
  return { columns: steps, links: [...linkMap.values()], undrawnPerHop }
}

/** Links in one canonical order, for comparing two link sets. */
export function canonLinks(links: ChartLink[]): string[] {
  return links.map((l) => `${l.source}\u0000${l.target}\u0000${l.value}`).sort()
}

/** A small deterministic PRNG (mulberry32), so a generated fixture is the same on every run. */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
