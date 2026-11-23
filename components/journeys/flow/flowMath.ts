// The Journeys page's arithmetic (every team's since 23-11-2026, a beta from 18-11;
// rulings R87 to R96 of 18-11-2026, Pulse/docs/plans/18-11-2026-journeys-page-overhaul-plan.md). Everything here is
// read from the journeys read as it is (GET /journeys/flow, lib/api/journeys.ts): per step its top pages with exact
// totals, the sessions between two consecutive steps (index −1 is the pages under the cut), and, since 18-11-2026,
// the visits that saw ONE page only by that page (entry_only). Nothing is estimated.
import type { JourneyFlow, JourneyFlowLink } from '@/lib/api/journeys'

/** The index the read gives the pages under a step's cut. */
export const OTHER = -1

export const stepName = (step: number) => (step === 0 ? 'Entry' : `Step ${step + 1}`)
export const pageName = (path: string) => (path === '(other)' ? 'Other pages' : path)

/** The visits that saw one page only, on page `index` of the first step's top (or under its cut: OTHER). */
export function entryOnlyAt(flow: JourneyFlow, index: number): number {
  if (index === OTHER) return flow.entry_only_other ?? 0
  return flow.entry_only?.[index] ?? 0
}

/** Every visit that saw one page only. */
export function entryOnlyTotal(flow: JourneyFlow): number {
  return (flow.entry_only ?? []).reduce((n, v) => n + v, 0) + (flow.entry_only_other ?? 0)
}

/**
 * The visits on page `index` of step `step`. At the first step that is every visit that began there: the ones that
 * went on (the step's own count) and the ones that saw that page only.
 */
export function sessionsAt(flow: JourneyFlow, step: number, index: number): number {
  const col = flow.columns[step]
  if (!col) return 0
  const own = index === OTHER ? col.other_sessions : col.top[index]?.[1] ?? 0
  return step === 0 ? own + entryOnlyAt(flow, index) : own
}

/** The visits of a whole step: at the first, every visit of the range. */
export function stepVisits(flow: JourneyFlow, step: number): number {
  const total = flow.columns[step]?.total_sessions ?? 0
  return step === 0 ? total + entryOnlyTotal(flow) : total
}

/** The sessions that went on from page `index` of step `step` to the next step. */
export function wentOnFrom(flow: JourneyFlow, step: number, from: Set<number>): number {
  let on = 0
  for (const [h, f, , n] of flow.links) if (h === step && from.has(f)) on += n
  return on
}

/**
 * The visits that left the site on page `index` of step `step`: its visits less those that went on. Known for every
 * step but the last one read (the read stops there): null there.
 */
export function leftAt(flow: JourneyFlow, step: number, index: number): number | null {
  if (step >= flow.depth - 1) return null
  return Math.max(0, sessionsAt(flow, step, index) - wentOnFrom(flow, step, new Set([index])))
}

/** What a set of pages of a step did next: the sessions that went on, the busiest page, and how many pages. */
export function nextOf(flow: JourneyFlow, step: number, from: Set<number>) {
  const to = new Map<number, number>()
  let on = 0
  for (const [h, f, t, n] of flow.links) {
    if (h !== step || !from.has(f)) continue
    on += n
    to.set(t, (to.get(t) ?? 0) + n)
  }
  const top = [...to.entries()].filter(([t]) => t !== OTHER).sort((a, b) => b[1] - a[1])[0]
  // The pages the read names, and whether some went to the pages under its cut (then the count is "at least").
  const named = [...to.keys()].filter((t) => t !== OTHER).length
  return { on, named, more: to.has(OTHER), top: top ? { path: flow.columns[step + 1]?.top[top[0]]?.[0] ?? '', n: top[1] } : null }
}

/** The indices of a step's `top` the chart folds into "Other pages" when it keeps `kept`, and the read's own rest. */
export function otherIndices(flow: JourneyFlow, step: number, kept: number): Set<number> {
  const col = flow.columns[step]
  const out = new Set<number>([OTHER])
  if (col) for (let j = kept; j < col.top.length; j++) out.add(j)
  return out
}

/** "Other pages" at a step when the chart keeps `kept` pages: the step's visits less its named pages'. */
export function otherVisits(flow: JourneyFlow, step: number, kept: number): number {
  const col = flow.columns[step]
  if (!col) return 0
  let named = 0
  for (let j = 0; j < Math.min(kept, col.top.length); j++) named += sessionsAt(flow, step, j)
  return stepVisits(flow, step) - named
}

/** The pages "Other pages" holds at a step when the chart keeps `kept`. */
export function otherPages(flow: JourneyFlow, step: number, kept: number): number {
  const col = flow.columns[step]
  return col ? Math.max(0, col.pages - Math.min(kept, col.top.length)) : 0
}

/**
 * The read with each step cut to `keep(step)` pages: the rest join that step's "(other)", and the links and the
 * one-page visits follow. Used to draw "Other pages" opened at one step (R96) while every other step keeps its cut.
 */
export function foldFlow(flow: JourneyFlow, keep: (step: number) => number): JourneyFlow {
  const columns = flow.columns.map((c, s) => {
    const k = keep(s)
    if (c.top.length <= k) return c
    const cut = c.top.slice(k)
    return { ...c, top: c.top.slice(0, k), other_sessions: c.other_sessions + cut.reduce((n, [, v]) => n + v, 0), other_pages: c.other_pages + cut.length }
  })
  const links = flow.links.map(([h, f, t, n]): JourneyFlowLink => [h, f >= keep(h) ? OTHER : f, t >= keep(h + 1) ? OTHER : t, n])
  const k0 = keep(0)
  const only = flow.entry_only
  return {
    ...flow,
    columns,
    links,
    ...(only ? { entry_only: only.slice(0, k0), entry_only_other: (flow.entry_only_other ?? 0) + only.slice(k0).reduce((n, v) => n + v, 0) } : {}),
  }
}

/** A path fitted to `room` px at about `char` px a letter: whole, else its first folder and its end, else its end. */
export function fitPath(path: string, room: number, char = 6.6): string {
  if (path === '(other)') return 'Other pages'
  const max = Math.max(4, Math.floor(room / char))
  if (path.length <= max) return path
  const parts = path.replace(/\/$/, '').split('/').filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  const withFolder = `/${parts[0]}/…/${last}`
  if (parts.length > 2 && withFolder.length <= max) return withFolder
  const tail = `…/${last}`
  return tail.length <= max ? tail : `…${last.slice(-(max - 1))}`
}

/** A link of the drawn chart: from one `step:path` node to the next. */
export interface ChartLink { source: string; target: string; value: number }

/** The busiest route through one node: the heaviest link back and forth from it, named pages only. */
export function routeThrough(links: readonly ChartLink[], id: string): string[] {
  const out = new Map<string, ChartLink[]>()
  const into = new Map<string, ChartLink[]>()
  for (const l of links) {
    if (!out.has(l.source)) out.set(l.source, [])
    out.get(l.source)!.push(l)
    if (!into.has(l.target)) into.set(l.target, [])
    into.get(l.target)!.push(l)
  }
  const path = (node: string) => node.slice(node.indexOf(':') + 1)
  const heaviest = (ls: ChartLink[] | undefined, end: 'source' | 'target') =>
    (ls ?? []).filter((l) => path(l[end]) !== '(other)').sort((a, b) => b.value - a.value)[0]?.[end] ?? null
  const back: string[] = []
  for (let at: string | null = heaviest(into.get(id), 'source'); at; at = heaviest(into.get(at), 'source')) back.unshift(path(at))
  const fwd: string[] = []
  for (let at: string | null = heaviest(out.get(id), 'target'); at; at = heaviest(out.get(at), 'target')) fwd.push(path(at))
  return [...back, path(id), ...fwd]
}

/**
 * The read cut to its first `steps` steps: one six-step read answers every Steps choice (3, 4, 5) at once, and
 * the pressed card still knows what came after the last step drawn. Columns do not depend on the depth read (each
 * is the pages at its own step), so a cut read is exactly the read at that depth.
 */
export function sliceFlow(flow: JourneyFlow, steps: number): JourneyFlow {
  if (flow.depth <= steps) return flow
  return { ...flow, depth: steps, columns: flow.columns.slice(0, steps), links: flow.links.filter(([h]) => h < steps - 1) }
}
