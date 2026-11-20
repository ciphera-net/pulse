'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowSquareOut, Copy, CursorClick, DownloadSimple, PaperPlaneTilt, Tag, WarningCircle, type Icon } from '@phosphor-icons/react'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { formatDuration } from '@/lib/visitors/format'
import { cn } from '@/lib/utils'
import type { TrailKind } from '@/lib/visitors/trail'
import type { VisitorDayVisit } from '@/lib/api/visitors'
import { dayPages, type DayItem, type DayPage } from './day'

// ---------------------------------------------------------------------------
// A visitor's day on their row (round 1i, the icons in the dots; R104 to R108; tone `ring`): a mark a page, visit by
// visit, joined by a line within a visit. A page where nothing happened is a small dot; a page where something did is a
// circle holding that event's glyph: a solid orange circle for the site's own event (what "converted" looks like), a
// dark circle with an orange ring for what Pulse captured itself. The glyphs are the visit trail's own (Phosphor).
// The marks take the room the column has and say "+n" past it; a hover names the page and what happened on it.
// ---------------------------------------------------------------------------

const KIND_GLYPH: Record<Exclude<TrailKind, 'pageview'>, Icon> = {
  click: CursorClick,
  copy: Copy,
  form: PaperPlaneTilt,
  outbound: ArrowSquareOut,
  download: DownloadSimple,
  event: Tag,
}

/** The small dot of a page where nothing happened. */
const DOT_R = 4.5
/** The circle holding a glyph, and the glyph. */
const ICON_R = 11
const ICON_GLYPH = 14
/** The room between two marks, edge to edge, and between two visits. */
const ICON_GAP = 7
const VISIT_GAP = 10
/** The room "+n" takes when a row has more pages than fit. */
const MORE_W = 30
/** The row's drawing: its height and centre line. */
const H = 24
const CY = 12
/** The most marks a row draws, whatever its room. */
const CAP = 12

/** Which of a page's events its mark shows: the site's own first, then what Pulse captured by weight, a 404 last. */
const WEIGHT: Record<TrailKind, number> = { event: 6, outbound: 5, download: 4, form: 3, click: 2, copy: 1, pageview: 0 }
const weightOf = (it: DayItem) => (it.own ? 7 : it.plain ? 0.5 : WEIGHT[it.kind])
export const topItem = (p: DayPage): DayItem | null =>
  p.items.reduce<DayItem | null>((best, it) => (!best || weightOf(it) > weightOf(best) ? it : best), null)
const glyphOf = (it: DayItem): Icon => (it.own ? Tag : it.plain ? WarningCircle : KIND_GLYPH[it.kind === 'pageview' ? 'event' : it.kind])
const edgeOf = (p: DayPage) => (topItem(p) ? ICON_R : DOT_R)

/** One page's mark. `on`: under the pointer (a lighter colour, never opacity). */
function Mark({ cx, page, on }: { cx: number; page: DayPage; on: boolean }) {
  const top = topItem(page)
  if (!top) return <circle cx={cx} cy={CY} r={DOT_R} className={on ? 'fill-neutral-100' : 'fill-neutral-500'} />
  const Glyph = glyphOf(top)
  const g = ICON_GLYPH / 2
  if (top.own) {
    return (
      <>
        <circle cx={cx} cy={CY} r={ICON_R} className={on ? 'fill-white' : 'fill-brand-ink'} data-mark-disc="own" />
        <Glyph x={cx - g} y={CY - g} size={ICON_GLYPH} weight="bold" className="text-neutral-950" aria-hidden="true" />
      </>
    )
  }
  return (
    <>
      <circle cx={cx} cy={CY} r={ICON_R - 0.75} strokeWidth={1.5} className={cn(on ? 'fill-neutral-700' : 'fill-neutral-900', 'stroke-brand-ink')} data-mark-disc="ring" />
      <Glyph x={cx - g} y={CY - g} size={ICON_GLYPH} weight="bold" className={on ? 'text-white' : 'text-brand-ink'} aria-hidden="true" />
    </>
  )
}

/** The room the row's marks have: the column's width, measured, so the marks never run past it. */
function useRoom(): [RefObject<HTMLSpanElement | null>, number] {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width))
    ro.observe(el)
    setW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

interface Laid {
  cx: number
  page: DayPage
  visit: number
  at: number
}

/** The marks laid out left to right within `budget` px (0: no limit), at most `limit` of them. */
export function layoutMarks(visits: readonly DayPage[][], limit: number, budget: number): { marks: Laid[]; full: boolean } {
  const total = visits.reduce((n, v) => n + v.length, 0)
  const marks: Laid[] = []
  let last: Laid | null = null
  for (let vi = 0; vi < visits.length; vi++) {
    for (let pi = 0; pi < visits[vi].length && marks.length < limit; pi++) {
      const page = visits[vi][pi]
      const edge = edgeOf(page)
      const apart = pi === 0 && marks.length > 0 ? VISIT_GAP : 0
      const x = last === null ? 2 + edge : last.cx + edgeOf(last.page) + ICON_GAP + edge + apart
      if (budget > 0 && x + edge + 2 > budget) return { marks, full: false }
      last = { cx: x, page, visit: vi, at: pi }
      marks.push(last)
    }
    if (marks.length >= limit) break
  }
  return { marks, full: marks.length === total }
}

/** What the marks say, for a screen reader: the visits, the pages, and each of the site's own events with its page. */
export function marksSaid(visits: readonly DayPage[][]): string {
  const total = visits.reduce((n, v) => n + v.length, 0)
  const fired = visits.flat().filter((p) => p.items.some((it) => it.own))
  const events = fired.map((p) => `${p.items.filter((it) => it.own).map((it) => it.text).join(' and ')} on ${p.path}`).join('; ')
  return `${visits.length} ${visits.length === 1 ? 'visit' : 'visits'}, ${total} ${total === 1 ? 'page' : 'pages'}${events ? `, ${events}` : ''}.`
}

export function DayMarks({ day }: { day: readonly VisitorDayVisit[] | undefined }) {
  const visits = dayPages(day)
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const [room, roomW] = useRoom()
  const total = visits.reduce((n, v) => n + v.length, 0)
  let laid = layoutMarks(visits, CAP, roomW)
  if (!laid.full && roomW > 0) laid = layoutMarks(visits, CAP, roomW - MORE_W)
  const { marks } = laid
  const lines: { x1: number; x2: number }[] = []
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1], b = marks[i]
    if (a.visit === b.visit) lines.push({ x1: a.cx + edgeOf(a.page) + 1.5, x2: b.cx - edgeOf(b.page) - 1.5 })
  }
  const width = Math.max(...marks.map((m) => m.cx + edgeOf(m.page)), 0) + 12
  const hidden = total - marks.length
  const lit = tip ? marks[tip.i] : null
  return (
    <span ref={room} className="relative flex min-w-0 flex-1 items-center" data-day-marks="">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block shrink-0 overflow-visible" aria-hidden="true" onMouseLeave={() => setTip(null)}>
        {lines.map((l, i) => l.x2 > l.x1 && <line key={i} x1={l.x1} y1={CY} x2={l.x2} y2={CY} strokeWidth={2} className="stroke-neutral-700" />)}
        {marks.map((m, i) => {
          const top = topItem(m.page)
          return (
            <g key={i} data-mark={top ? (top.own ? 'own' : top.plain ? 'plain' : top.kind) : 'page'}>
              <Mark cx={m.cx} page={m.page} on={tip?.i === i} />
              <rect
                x={m.cx - edgeOf(m.page) - ICON_GAP / 2}
                y={0}
                width={2 * edgeOf(m.page) + ICON_GAP}
                height={H}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={(e) => { const b = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); setTip({ i, x: b.left + m.cx, y: b.top }) }}
              />
            </g>
          )
        })}
      </svg>
      {hidden > 0 && <span className="ml-1 shrink-0 text-[11px] tabular-nums text-neutral-500" data-marks-more={hidden}>+{hidden}</span>}
      <span className="sr-only">{marksSaid(visits)}</span>
      {lit && tip && typeof document !== 'undefined' && createPortal(
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full pb-2" style={{ left: tip.x, top: tip.y }} data-mark-tip="">
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className="max-w-[22rem] rounded-none glass-panel border border-white/[0.08] px-3 py-2 text-sm font-medium text-white shadow-lg"
          >
            <div className="mb-1 truncate">{lit.page.path}</div>
            <div className="text-xs font-normal tabular-nums text-neutral-400">
              {visits.length > 1 ? `Visit ${lit.visit + 1} of ${visits.length}, page ${lit.at + 1} of ${visits[lit.visit].length}` : `Page ${lit.at + 1} of ${visits[lit.visit].length}`}
            </div>
            {lit.page.seconds != null && <div className="text-xs font-normal tabular-nums text-neutral-400">{formatDuration(lit.page.seconds)} on the page</div>}
            {lit.page.items.map((it, i) => {
              const Glyph = glyphOf(it)
              return (
                <div key={i} className={cn('mt-1 flex items-center gap-1.5 text-xs font-normal', it.own ? 'text-brand-ink' : 'text-neutral-300')} data-mark-tip-item={it.own ? 'own' : it.plain ? 'plain' : it.kind}>
                  <Glyph className="h-3 w-3 shrink-0 text-brand-ink" aria-hidden="true" />
                  <span className={cn('truncate', it.own && 'font-mono')}>{it.text}</span>
                </div>
              )
            })}
          </motion.div>
        </div>,
        document.body,
      )}
    </span>
  )
}
