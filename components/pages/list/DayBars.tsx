'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { formatNumber } from '@/lib/utils/format'
import { bucketName, bucketValues, type Bucket, type BucketKind } from './buckets'

// ---------------------------------------------------------------------------
// A page's days as bars, on its row of the Pages page (ruling R78, 17-11-2026). OpenPanel's Pages report draws a
// small bar chart of a page's days beside its name; this is that device in the brand's orange, each row against
// its own busiest day. On a range of one day the bars are the day's hours (ruling R81).
//
// The bar under the pointer lights (by colour, never opacity: the bars touch) and is named in the dashboard's own
// hover card (the heat map's and the journeys flow's: components/dashboard/bottom/). The card is drawn in the
// page's top layer, so a row that clips its fill cannot clip it.
// ---------------------------------------------------------------------------

const W = 168
const H = 22
const DASH = '—'
const VIEWS = { one: 'view', many: 'views' }

export interface DayBarsProps {
  /** Daily views across the range, oldest first. */
  values: number[]
  kind: BucketKind
  buckets: Bucket[]
  /** The range ends today, still being counted: its bar is drawn lighter and its card says "so far". */
  live: boolean
  className?: string
  /**
   * A range of one day: the bars are its HOURS. Each bar's name in order ("09:00 – 10:00"); `values` are then drawn
   * as they are, one bar an hour, and `kind` and `buckets` are not read.
   */
  hours?: string[]
  /**
   * The drawing's height in px (22, the row's, when unset). The dashboard's event tile draws them taller and wider;
   * with a height the bars are drawn to the element's own pixels, so the gaps stay the row's 1 to 1.5 px at any width
   * instead of stretching.
   */
  height?: number
  /** What a bar counts, as its card says it (views, when unset). */
  unit?: { one: string; many: string }
}

interface Tip { at: number; x: number; y: number }

export default function DayBars({ values, kind, buckets, live, className = '', hours, height, unit = VIEWS }: DayBarsProps) {
  const [tip, setTip] = useState<Tip | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [measured, setMeasured] = useState<number | null>(null)
  useEffect(() => {
    const el = svg.current
    if (height === undefined || !el || typeof ResizeObserver === 'undefined') return
    const fit = () => setMeasured(el.clientWidth || null)
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [height])
  const vw = height !== undefined && measured ? measured : W
  const vh = height ?? H
  const days = values.length
  const bars = useMemo(() => (hours ? values : bucketValues(values, buckets, false, days).map((b) => b.views)), [values, buckets, days, hours])
  const peak = Math.max(1, ...bars)
  const n = bars.length
  if (n === 0) return <span className={`inline-block text-[11px] text-neutral-600 ${className}`}>{DASH}</span>
  const gap = n > 30 ? 1 : 1.5
  const w = (vw - gap * (n - 1)) / n
  const at = tip?.at ?? null
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - box.left) / box.width) * n)))
    setTip({ at: i, x: box.left + ((i + 0.5) / n) * box.width, y: box.top })
  }
  return (
    <>
      <svg
        ref={svg}
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="none"
        className={`block ${height === undefined ? 'h-[22px] ' : ''}${className}`}
        style={height === undefined ? undefined : { height }}
        onMouseMove={move}
        onMouseLeave={() => setTip(null)}
        aria-hidden="true"
        data-day-bars=""
      >
        {bars.map((v, i) => {
          const h = v > 0 ? Math.max(1.5, (v / peak) * vh) : 0.75
          const today = live && (hours !== undefined || kind === 'day') && i === n - 1
          const fill = at === i ? 'rgb(var(--primary))' : at !== null ? 'rgb(var(--primary) / 0.26)' : today ? 'rgb(var(--primary) / 0.3)' : 'rgb(var(--primary) / 0.6)'
          return <rect key={i} x={i * (w + gap)} y={vh - h} width={w} height={h} fill={fill} />
        })}
      </svg>
      {tip && typeof document !== 'undefined' && createPortal(
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full pb-2" style={{ left: tip.x, top: tip.y }} data-day-tip="">
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className="whitespace-nowrap rounded-none glass-panel border border-white/[0.08] px-3 py-2 text-sm font-medium text-white shadow-lg"
          >
            <div className="mb-1">{hours ? hours[tip.at] : bucketName(kind, buckets[tip.at])}</div>
            <div className="text-xs font-normal tabular-nums text-neutral-400">
              {formatNumber(bars[tip.at])} {bars[tip.at] === 1 ? unit.one : unit.many}
              {live && (hours !== undefined || kind === 'day') && tip.at === n - 1 ? ', so far' : ''}
            </div>
          </motion.div>
        </div>,
        document.body,
      )}
    </>
  )
}
