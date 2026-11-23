'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import type { JourneyFlow } from '@/lib/api/journeys'
import { chainThroughLink, chainThroughNode, linkKey, pathOfNode, stepOfNode, type Chain } from '@/lib/journeys/chain'
import { layoutSankey, NODE_WIDTH, type SankeyLayoutResult, type SankeyLink, type SankeyNode } from '@/lib/journeys/sankeyLayout'
import { formatNumber } from '@/lib/utils/format'
import {
  OTHER,
  entryOnlyAt,
  fitPath,
  foldFlow,
  leftAt,
  otherIndices,
  otherPages,
  otherVisits,
  pageName,
  routeThrough,
  sessionsAt,
  stepName,
  stepVisits,
  wentOnFrom,
} from './flowMath'
import PressedCard from './PressedCard'

// ---------------------------------------------------------------------------
// The Journeys page's flow (every team's since 23-11-2026, a beta from 18-11; rulings R87 to R96 of 18-11-2026,
// Pulse/docs/plans/18-11-2026-journeys-page-overhaul-plan.md, picked and refined on the lab). The dashboard's own
// Journeys block (MiniFlow) grown to the page: the same layout (lib/journeys/sankeyLayout) and the same hover, with
//   a count beside every page, and the rest of a step as "Other pages" with the STEP'S OWN figure (the layout's
//     strip sums only the links it draws, which leave out the visits between two other pages);
//   labels that never run into each other: right of each page, fitted to the room before the next step, pushed apart
//     in a step; narrower than STEP_MIN a step (a phone), the chart keeps that room and scrolls sideways;
//   heads in words ("Step 3 · 14,066 visits, 72% went on");
//   where visits left: a grey "Left the site" bar at each step, fed by the pages that lost visits there. After the
//     FIRST step too since the read counts the visits that saw one page only (entry_only): the Entry column then holds
//     every visit, each starting page drawn with the ones that went on and the ones that left;
//   a press keeps a page or a link lit in pale, and the pointer still lights a journey in the brand orange over it;
//     the busiest starting page is pressed on arrival, a close is kept in the address (`pin=none`), a press in the
//     address wins (R90, R92, R94);
//   "Other pages" pressed opens in the chart: its ten busiest pages drawn at that step, lit with the rest (R96);
//   the pressed card under the block, in a block of its own (PressedCard.tsx).
// ---------------------------------------------------------------------------

/** The pointer's journey: the brand orange. */
const ORANGE = '#FD5E0F'
/**
 * The pressed journey: pale on the dark theme (picked 18-11-2026), and on the light theme
 * the same shade moved toward that theme's ink, so it still reads on white (styles/globals.css --journeys-pressed).
 */
const PRESSED = 'rgb(var(--journeys-pressed))'
/**
 * A page's way out of the site (18-11-2026, picked from four options): the hovered page's route into "Left the site"
 * and its own share of the bar light in red, the pressed page's more quietly, so where its visitors went on (orange)
 * and where they left (red) read apart. Only the page's OWN way out lights: further along a journey a page's leavers
 * include visitors who came from other pages. The themed status red, the app's red for a fall (the funnel rail's step
 * change). Pulse/docs/plans/18-11-2026-journeys-page-overhaul-plan.md, "The way out".
 */
const RED = 'rgb(var(--red-400))'
const HEAD = 34
/** The chart's most height; "Other pages" opened draws more pages at one step, and takes more. */
const HEIGHT = 520
const HEIGHT_OPENED = 700
/** Pages a step keeps before "Other pages". */
const PAGES = 6
/** Pages "Other pages" opens into the chart. */
const EXTRA = 10
/** The room the last step's labels take, right of the chart. */
const GUTTER = 210
const LABEL_GAP = 18
/**
 * The page names stand out from the routes (R102, 18-11-2026: names were too small and sometimes lost in the routes' colour;
 * picked from two rounds of options, "Quieter routes, louder names"): 14 px semibold names
 * over routes drawn at ROUTE_STRENGTH of their old opacity, the pointer's orange left as it was. A name off a lit
 * journey stays readable in grey 400 (it was grey 700, close to the block's own colour, and the page always opens with
 * a journey pressed). Pulse/docs/plans/18-11-2026-journeys-page-overhaul-plan.md, "The page names".
 */
const NAME_SIZE = 14
const COUNT_SIZE = 12
const ROUTE_STRENGTH = 0.55
/** The average advance of a name's character at NAME_SIZE semibold (measured on the lab, 8.5 px), for fitting a name. */
const NAME_CHAR = 8.6
/** A count's digit at COUNT_SIZE. */
const COUNT_CHAR = 7.2
/** The least room a step has. Narrower (a phone), the chart keeps it and scrolls sideways. */
const STEP_MIN = 190
/** The layout's own constants (lib/journeys/sankeyLayout.ts): its busiest link, its gap and its smallest strip. */
const MAX_LINK_HEIGHT = 50
const NODE_GAP = 20
const MIN_NODE_HEIGHT = 3

type Lit = { kind: 'node'; id: string } | { kind: 'link'; source: string; target: string } | null
interface Tip { x: number; y: number; title: string; sub: string; more?: string; flip: boolean }
interface Bar { step: number; x: number; y: number; height: number; left: number; of: number }
interface Feed { key: string; source: string; sourceX: number; sourceY: number; targetX: number; targetY: number; width: number }

function readPin(raw: string | null): Lit {
  if (!raw) return null
  const bar = raw.indexOf('|')
  if (bar > 0 && /^\d+:/.test(raw.slice(bar + 1))) return { kind: 'link', source: raw.slice(0, bar), target: raw.slice(bar + 1) }
  return /^\d+:/.test(raw) ? { kind: 'node', id: raw } : null
}
const writePin = (pin: Lit) => (pin ? (pin.kind === 'node' ? pin.id : `${pin.source}|${pin.target}`) : null)
const same = (a: Lit, b: Lit) => !!a && !!b && writePin(a) === writePin(b)

export interface FlowChartProps {
  /** The chart's read, at the steps it draws. */
  flow: JourneyFlow
  /** The six-step read: what came after the chart's last step, for the pressed card. */
  deep?: JourneyFlow
  /** Where the pressed card is drawn: a slot under the chart's block. */
  cardSlot: HTMLElement | null
  /** A member may make a funnel of the pressed route (the route, and the page it was pressed on); a public view reads only. */
  onFunnel?: (route: string[], via: string) => void
}

export default function FlowChart({ flow, deep, cardSlot, onFunnel }: FlowChartProps) {
  const box = useRef<HTMLDivElement>(null)
  const asked = useSearchParams()
  const [w, setW] = useState(0)
  const [hover, setHover] = useState<Lit>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const [pin, setPin] = useState<Lit | 'none' | undefined>(() => {
    const raw = asked.get('pin')
    return raw === 'none' ? 'none' : readPin(raw) ?? undefined
  })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // "Other pages" opened in the chart (R96): read from the raw press, as the layout cannot depend on the press it
  // checks; a press on one of the opened pages keeps them drawn.
  const opened = useMemo(() => {
    if (!pin || pin === 'none' || pin.kind !== 'node') return null
    const step = stepOfNode(pin.id)
    const path = pathOfNode(pin.id)
    const extra = (flow.columns[step]?.top ?? []).slice(PAGES, PAGES + EXTRA).map(([p]) => p)
    return path === '(other)' || extra.includes(path) ? step : null
  }, [pin, flow])
  const keptAt = useCallback((step: number) => (step === opened ? PAGES + EXTRA : PAGES), [opened])
  const chartFlow = useMemo(() => (opened == null ? flow : foldFlow(flow, keptAt)), [flow, opened, keptAt])
  const height = opened != null ? HEIGHT_OPENED : HEIGHT

  const drawn = flow.columns.filter((c) => c.total_sessions > 0).length
  const cw = w > 0 ? Math.max(w, (drawn - 1) * STEP_MIN + GUTTER) : 0

  /** A drawn node's index in the read's top at its step (OTHER for "Other pages"). */
  const indexOf = useCallback((n: { step: number; path: string }) => (n.path === '(other)' ? OTHER : flow.columns[n.step]?.top.findIndex(([p]) => p === n.path) ?? OTHER), [flow])
  /** A drawn node's visits: a named page's, or "Other pages" at the step's cut. */
  const visitsOf = useCallback((n: { step: number; path: string }) => (n.path === '(other)' ? otherVisits(flow, n.step, keptAt(n.step)) : sessionsAt(flow, n.step, indexOf(n))), [flow, keptAt, indexOf])
  /** The visits that left the site on a drawn node: null at the last step read. */
  const leftOf = useCallback((n: { step: number; path: string }) => {
    if (n.step >= flow.depth - 1) return null
    if (n.path !== '(other)') return leftAt(flow, n.step, indexOf(n))
    return Math.max(0, otherVisits(flow, n.step, keptAt(n.step)) - wentOnFrom(flow, n.step, otherIndices(flow, n.step, keptAt(n.step))))
  }, [flow, keptAt, indexOf])

  // The layout, then the first step's strips grown by the visits that saw that page only (their feed into the "Left
  // the site" bar leaves from under their links), re-stacked, and their links moved with them; then the "Left the
  // site" bars and their feeds. A strip grows by its one-page visits and nothing else: "Other pages" is drawn at the
  // size of its links at every step (its label carries the step's own figure), the first step included.
  // `bottom` is the lowest thing drawn (a strip or a "Left the site" bar), in the layout's units; `tall` is the room
  // the chart is fitted into, a little more than that.
  const drawing = useMemo((): { layout: SankeyLayoutResult; bars: Bar[]; feeds: Feed[]; bottom: number; tall: number } | null => {
    if (cw <= 0) return null
    const base = layoutSankey(chartFlow, { maxPagesPerStep: opened == null ? PAGES : PAGES + EXTRA, width: Math.max(200, cw - GUTTER) })
    if (base.links.length === 0) return { layout: base, bars: [], feeds: [], bottom: base.height, tall: base.height }
    const k = MAX_LINK_HEIGHT / Math.max(1, ...base.links.map((l) => l.value))
    const h = (v: number) => v * k
    const onePage = (n: { step: number; path: string }) =>
      n.path === '(other)'
        ? [...otherIndices(flow, 0, keptAt(0))].reduce((s, i) => s + entryOnlyAt(flow, i), 0)
        : entryOnlyAt(flow, indexOf(n))
    const nodes: SankeyNode[] = base.nodes.map((n) => ({ ...n }))
    const shift = new Map<string, number>()
    const firsts = nodes.filter((n) => n.step === 0).sort((a, b) => a.y - b.y)
    let y = firsts[0]?.y ?? 0
    for (const n of firsts) {
      const height = Math.max(MIN_NODE_HEIGHT, n.height + h(onePage(n)))
      shift.set(n.id, y - n.y)
      n.y = y
      n.height = height
      y += height + NODE_GAP
    }
    const links: SankeyLink[] = base.links.map((l) => ({ ...l, sourceY: l.sourceY + (shift.get(l.source) ?? 0) }))
    const out = (id: string) => links.filter((l) => l.source === id).reduce((n, l) => n + h(l.value), 0)
    const bars: Bar[] = []
    const feeds: Feed[] = []
    for (let step = 0; step < flow.depth - 1; step++) {
      const left = stepVisits(flow, step) - (flow.columns[step + 1]?.total_sessions ?? 0)
      const col = base.steps.find((s) => s.index === step + 1)
      if (left <= 0 || !col) continue
      const bottom = Math.max(0, ...nodes.filter((n) => n.step === step + 1).map((n) => n.y + n.height))
      const bar: Bar = { step: step + 1, x: col.x, y: bottom + 28, height: Math.max(MIN_NODE_HEIGHT, h(left)), left, of: stepVisits(flow, step) }
      bars.push(bar)
      let into = bar.y
      const from = nodes
        .filter((n) => n.step === step)
        .map((n) => ({ n, left: leftOf(n) ?? 0 }))
        .filter((r) => r.left > 0)
        .sort((a, b) => b.left - a.left)
      for (const r of from) {
        const width = h(r.left)
        feeds.push({ key: `drop:${r.n.id}`, source: r.n.id, sourceX: r.n.x + NODE_WIDTH, sourceY: Math.min(r.n.y + r.n.height - width / 2, r.n.y + out(r.n.id) + width / 2), targetX: bar.x, targetY: into + width / 2, width: Math.max(1, width) })
        into += width
      }
    }
    const bottom = Math.max(base.height, y - NODE_GAP, ...bars.map((b) => b.y + b.height))
    return { layout: { ...base, nodes, links }, bars, feeds, bottom, tall: bottom + 20 }
  }, [chartFlow, cw, opened, flow, leftOf, keptAt, indexOf])
  const layout = drawing?.layout ?? null
  const sy = drawing && drawing.tall > 0 ? Math.min(1, (height - HEAD - 8) / drawing.tall) : 1

  // The first journey: the top page of Entry, where most journeys began.
  const first: Lit = useMemo(() => {
    const n = layout?.nodes.filter((x) => x.step === 0 && x.path !== '(other)').sort((a, b) => a.y - b.y)[0]
    return n ? { kind: 'node', id: n.id } : null
  }, [layout])
  // A press that names nothing on this chart (the steps changed under it) is let go. "Other pages" opened is the one
  // exception: where its step has no more pages than the chart opens, nothing is left under the cut and its strip is
  // gone, yet the press still names the pages it opened.
  const pinned: Lit = useMemo(() => {
    if (!layout || pin === 'none') return null
    if (pin === undefined) return first
    const p = pin
    if (!p) return null
    if (p.kind === 'node' && pathOfNode(p.id) === '(other)' && stepOfNode(p.id) === opened) return p
    if (p.kind === 'node') return layout.nodes.some((n) => n.id === p.id) ? p : null
    return layout.links.some((l) => l.source === p.source && l.target === p.target) ? p : null
  }, [pin, first, layout, opened])
  useEffect(() => {
    const u = new URL(window.location.href)
    // The first journey is the page's own default: the address names a press only when the visitor made one.
    const v = pin === 'none' ? 'none' : pin === undefined ? null : writePin(pinned)
    if ((u.searchParams.get('pin') ?? null) === v) return
    if (v) u.searchParams.set('pin', v)
    else u.searchParams.delete('pin')
    window.history.replaceState({}, '', u.toString())
  }, [pin, pinned])
  const press = useCallback((next: Lit) => setPin(same(pinned, next) ? 'none' : next), [pinned])
  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPin('none') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinned])

  // Two highlights at once: the press in pale, and the pointer's journey in the brand orange over it.
  const chainOf = useCallback((at: Lit): Chain | null => {
    if (!at || !layout) return null
    return at.kind === 'link' ? chainThroughLink(layout.links, at.source, at.target) : chainThroughNode(layout.links, at.id)
  }, [layout])
  const pinChain = useMemo((): Chain | null => {
    // "Other pages" opened: its drawn pages and its rest are lit together, as the one group it is.
    if (opened != null && layout && pinned?.kind === 'node' && pathOfNode(pinned.id) === '(other)') {
      const extra = new Set((flow.columns[opened]?.top ?? []).slice(PAGES, PAGES + EXTRA).map(([p]) => `${opened}:${p}`))
      const all: Chain = { nodeIds: new Set<string>(), linkKeys: new Set<string>() }
      for (const n of layout.nodes) {
        if (n.step !== opened || !(extra.has(n.id) || n.path === '(other)')) continue
        const c = chainThroughNode(layout.links, n.id)
        c.nodeIds.forEach((x) => all.nodeIds.add(x))
        c.linkKeys.forEach((x) => all.linkKeys.add(x))
      }
      return all
    }
    return chainOf(pinned)
  }, [chainOf, pinned, opened, layout, flow])
  const hoverChain = useMemo(() => chainOf(hover), [chainOf, hover])
  const lit = Boolean(pinChain || hoverChain)
  const inChains = (id: string) => !!(hoverChain?.nodeIds.has(id) || pinChain?.nodeIds.has(id))
  const tone = (ofHover: boolean, ofPin: boolean) => (ofHover ? ORANGE : ofPin ? PRESSED : null)
  const rank = (key: string) => (hoverChain?.linkKeys.has(key) ? 2 : pinChain?.linkKeys.has(key) ? 1 : 0)

  // Labels: right of each page, pushed apart in a step, fitted to the room they have; then the step's bar.
  const labels = useMemo(() => {
    if (!layout || !drawing) return []
    const xs = layout.steps.map((s) => s.x)
    const out: { id: string; x: number; y: number; text: string; count: number; step: number; path: string }[] = []
    for (const s of layout.steps) {
      const nodes = layout.nodes.filter((n) => n.step === s.index).sort((a, b) => a.y - b.y)
      const room = (xs[layout.steps.indexOf(s) + 1] ?? cw) - s.x - NODE_WIDTH - 14
      let last = -Infinity
      for (const n of nodes) {
        const y = Math.max((n.y + n.height / 2) * sy, last + LABEL_GAP)
        last = y
        const count = visitsOf(n)
        out.push({ id: n.id, x: n.x + NODE_WIDTH + 6, y, text: fitPath(n.path, room - String(count).length * COUNT_CHAR - 10, NAME_CHAR), count, step: n.step, path: n.path })
      }
      const bar = drawing.bars.find((b) => b.step === s.index)
      if (bar) {
        const y = Math.max((bar.y + bar.height / 2) * sy, last + LABEL_GAP)
        out.push({ id: `drop:${s.index}`, x: bar.x + NODE_WIDTH + 6, y, text: 'Left the site', count: bar.left, step: s.index, path: '(left)' })
      }
    }
    return out
  }, [layout, drawing, sy, cw, visitsOf])
  // The chart's height: what it draws and no more (no empty band under it, no bar cut at its foot).
  const chartH = drawing ? Math.min(height, HEAD + Math.max(drawing.bottom * sy, ...labels.map((l) => l.y + 10)) + 8) : height

  const place = (e: ReactPointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return null
    const x = e.clientX - r.left
    return { x, y: e.clientY - r.top, flip: x > r.width * 0.62 }
  }
  // The pointer's own state: a mouse only, so a tap on a phone presses without leaving a card behind.
  const onNode = (e: ReactPointerEvent, n: { id: string; step: number; path: string }) => {
    if (e.pointerType !== 'mouse') return
    const at = place(e)
    setHover({ kind: 'node', id: n.id })
    if (!at) return
    const visits = visitsOf(n)
    const left = leftOf(n)
    if (n.path === '(other)') {
      const keep = keptAt(n.step)
      const names = (flow.columns[n.step]?.top ?? []).slice(keep, keep + 3).map(([p]) => p)
      setTip({ ...at, title: 'Other pages', sub: `${formatNumber(visits)} visitors on ${formatNumber(otherPages(flow, n.step, keep))} more pages`, more: names.length ? `Busiest: ${names.join(', ')}` : undefined })
    } else {
      setTip({ ...at, title: n.path, sub: `${formatNumber(visits)} visitors${left ? `, ${formatNumber(left)} left the site here` : ''}` })
    }
  }
  const clear = () => { setHover(null); setTip(null) }
  const curve = (sx: number, y1: number, tx: number, y2: number) => {
    const gap = tx - sx
    return `M ${sx},${y1} C ${sx + gap / 3},${y1} ${tx - gap / 3},${y2} ${tx},${y2}`
  }

  return (
    <div data-journeys-flow-chart="">
      <div ref={box} className="relative" style={{ height: chartH }} onMouseLeave={clear} data-journeys-flow="">
        <div className="h-full overflow-x-auto overflow-y-hidden" data-journeys-flow-scroll="">
          {layout && drawing && (
            <svg width={cw} height={chartH} className="block" aria-label="Journeys, step by step">
              {/* The chart's empty space: a press there lets the press go. */}
              <rect x={0} y={0} width={cw} height={chartH} fill="transparent" onClick={() => setPin('none')} onPointerMove={() => { if (hover) clear() }} data-journeys-ground="" />
              {layout.steps.map((s, i) => {
                const visits = stepVisits(flow, s.index)
                const prev = i > 0 ? stepVisits(flow, layout.steps[i - 1].index) : 0
                return (
                  <g key={s.index} style={{ pointerEvents: 'none' }}>
                    <text x={s.x} y={12} fontSize={13} fontWeight={500} fill="rgb(var(--neutral-200))">{stepName(s.index)}</text>
                    <text x={s.x} y={28} fontSize={11} fill="rgb(var(--neutral-500))">
                      {formatNumber(visits)} visitors{prev > 0 ? `, ${Math.round((visits / prev) * 100)}% went on` : ''}
                    </text>
                  </g>
                )
              })}
              <g transform={`translate(0 ${HEAD})`}>
                {/* Painted in order: the rest, then the press, then the pointer's, so the pointer's orange is on top. */}
                {[...layout.links].sort((a, b) => rank(a.key) - rank(b.key)).map((l) => {
                  const ofHover = hoverChain?.linkKeys.has(l.key) ?? false
                  const ofPin = pinChain?.linkKeys.has(l.key) ?? false
                  const c = tone(ofHover, ofPin)
                  return (
                    <path key={l.key} d={curve(l.sourceX, l.sourceY * sy, l.targetX, l.targetY * sy)} fill="none" stroke={c ?? 'rgb(var(--neutral-500))'} strokeOpacity={ofHover ? 0.45 : (lit ? (ofPin ? 0.6 : 0.07) : 0.2) * ROUTE_STRENGTH} strokeWidth={Math.max(1, l.strokeWidth * sy)} style={{ pointerEvents: 'none', transition: 'stroke-opacity 150ms' }} data-journeys-link-tone={ofHover ? 'hover' : ofPin ? 'pressed' : ''} />
                  )
                })}
                {layout.links.map((l) => (
                  <path
                    key={`hit:${l.key}`}
                    d={curve(l.sourceX, l.sourceY * sy, l.targetX, l.targetY * sy)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(10, l.strokeWidth * sy)}
                    className="cursor-pointer"
                    data-journeys-link={linkKey(l.source, l.target)}
                    onPointerMove={(e) => { if (e.pointerType !== 'mouse') return; const at = place(e); setHover({ kind: 'link', source: l.source, target: l.target }); if (at) setTip({ ...at, title: `${pageName(pathOfNode(l.source))} → ${pageName(pathOfNode(l.target))}`, sub: `${formatNumber(l.value)} visitors` }) }}
                    onClick={() => press({ kind: 'link', source: l.source, target: l.target })}
                  />
                ))}
                {drawing.feeds.map((d) => {
                  const on = lit ? inChains(d.source) : true
                  const ofHover = hover?.kind === 'node' && hover.id === d.source
                  const out = ofHover || (pinned?.kind === 'node' && pinned.id === d.source)
                  return (
                    <path key={d.key} d={curve(d.sourceX, d.sourceY * sy, d.targetX, d.targetY * sy)} fill="none" stroke={out ? RED : 'rgb(var(--neutral-600))'} strokeOpacity={out ? (ofHover ? 0.55 : 0.3) : (lit ? (on ? 0.2 : 0.04) : 0.12) * ROUTE_STRENGTH} strokeWidth={Math.max(1, d.width * sy)} style={{ pointerEvents: 'none', transition: 'stroke-opacity 150ms' }} data-journeys-drop-feed={d.source} data-journeys-drop-lit={out ? (ofHover ? 'hover' : 'pressed') : ''} />
                  )
                })}
                {drawing.bars.map((b) => (
                  <rect
                    key={`drop:${b.step}`}
                    x={b.x}
                    y={b.y * sy}
                    width={NODE_WIDTH}
                    height={Math.max(2, b.height * sy)}
                    fill="rgb(var(--neutral-700))"
                    data-journeys-drop={b.step}
                    onPointerMove={(e) => { if (e.pointerType !== 'mouse') return; const at = place(e); setHover(null); if (at) setTip({ ...at, title: `Left the site after ${stepName(b.step - 1).toLowerCase()}`, sub: `${formatNumber(b.left)} visitors, ${Math.round((b.left / Math.max(1, b.of)) * 100)}% of ${stepName(b.step - 1).toLowerCase()}` }) }}
                  />
                ))}
                {/* The lit page's own share of its "Left the site" bar, over the bar. */}
                {drawing.feeds.map((d) => {
                  const ofHover = hover?.kind === 'node' && hover.id === d.source
                  if (!ofHover && !(pinned?.kind === 'node' && pinned.id === d.source)) return null
                  return <rect key={`band:${d.key}`} x={d.targetX} y={(d.targetY - d.width / 2) * sy} width={NODE_WIDTH} height={Math.max(2, d.width * sy)} fill={RED} fillOpacity={ofHover ? 1 : 0.7} style={{ pointerEvents: 'none' }} data-journeys-drop-band={d.source} />
                })}
                {layout.nodes.map((n) => {
                  const on = lit ? inChains(n.id) : true
                  const c = tone(hoverChain?.nodeIds.has(n.id) ?? false, pinChain?.nodeIds.has(n.id) ?? false)
                  const isPin = pinned?.kind === 'node' && pinned.id === n.id
                  return (
                    <rect
                      key={n.id}
                      x={n.x}
                      y={n.y * sy}
                      width={NODE_WIDTH}
                      height={Math.max(2, n.height * sy)}
                      fill={c ?? 'rgb(var(--neutral-500))'}
                      fillOpacity={on ? 1 : 0.08}
                      stroke={isPin ? 'rgb(var(--neutral-100))' : 'none'}
                      strokeWidth={isPin ? 1.5 : 0}
                      className="cursor-pointer"
                      data-journeys-node={n.id}
                      data-journeys-node-tone={c === ORANGE ? 'hover' : c ? 'pressed' : ''}
                      onPointerMove={(e) => onNode(e, n)}
                      onClick={() => press({ kind: 'node', id: n.id })}
                    />
                  )
                })}
                {labels.map((l) => {
                  if (l.path === '(left)') {
                    return (
                      <text key={`label:${l.id}`} x={l.x} y={l.y} dominantBaseline="middle" fontSize={NAME_SIZE} fill={lit ? 'rgb(var(--neutral-500))' : 'rgb(var(--neutral-400))'} style={{ pointerEvents: 'none' }} data-journeys-drop-label={l.step}>
                        {l.text}
                        <tspan dx={6} fontSize={COUNT_SIZE} fill={lit ? 'rgb(var(--neutral-600))' : 'rgb(var(--neutral-500))'}>{formatNumber(l.count)}</tspan>
                      </text>
                    )
                  }
                  const on = lit ? inChains(l.id) : true
                  const isPin = pinned?.kind === 'node' && pinned.id === l.id
                  return (
                    <text
                      key={`label:${l.id}`}
                      x={l.x}
                      y={l.y}
                      dominantBaseline="middle"
                      fontSize={NAME_SIZE}
                      fontWeight={600}
                      fill={isPin ? 'rgb(var(--neutral-50))' : on ? 'rgb(var(--neutral-100))' : 'rgb(var(--neutral-400))'}
                      className="cursor-pointer"
                      data-journeys-label={l.id}
                      onPointerMove={(e) => onNode(e, { id: l.id, step: l.step, path: l.path })}
                      onClick={() => press({ kind: 'node', id: l.id })}
                    >
                      {l.text}
                      <tspan dx={6} fontSize={COUNT_SIZE} fontWeight={400} fill={on ? 'rgb(var(--neutral-400))' : 'rgb(var(--neutral-600))'}>{formatNumber(l.count)}</tspan>
                    </text>
                  )
                })}
              </g>
            </svg>
          )}
        </div>
        {tip && (
          <div className="pointer-events-none absolute z-10 whitespace-nowrap glass-panel border border-white/[0.08] px-3 py-2 text-sm font-medium text-white shadow-lg" style={{ left: tip.flip ? undefined : tip.x + 14, right: tip.flip ? (box.current?.clientWidth ?? 0) - tip.x + 14 : undefined, top: tip.y + 14 }}>
            <div className="mb-1">{tip.title}</div>
            <div className="text-xs font-normal tabular-nums text-neutral-400">{tip.sub}</div>
            {tip.more && <div className="mt-1 text-xs font-normal text-neutral-500" data-journeys-tip-more="">{tip.more}</div>}
          </div>
        )}
      </div>
      {pinned && layout && cardSlot && createPortal(
        <PressedCard
          flow={flow}
          deep={deep}
          pin={pinned}
          links={layout.links}
          kept={PAGES}
          route={pinned.kind === 'node' && pathOfNode(pinned.id) !== '(other)' ? routeThrough(layout.links, pinned.id) : []}
          onFunnel={onFunnel && pinned.kind === 'node' ? (route) => onFunnel(route, pathOfNode(pinned.id)) : undefined}
          onClose={() => setPin('none')}
        />,
        cardSlot,
      )}
    </div>
  )
}
