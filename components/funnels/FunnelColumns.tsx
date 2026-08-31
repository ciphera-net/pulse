'use client'

import { useCallback, useId, useRef } from 'react'
import { FileText, House, Lightning } from '@phosphor-icons/react'
import type { FunnelStepStats, FunnelStep } from '@/lib/api/funnels'
import { ParentSize } from '@/lib/charts/primitives'
import { formatNumber, formatConvertTime } from '@/lib/utils/format'

// ---------------------------------------------------------------------------
// FunnelColumns — the funnels hero, approved 31-08-2026 (options round 5,
// "tall columns"): thick gradient columns on faint 100% tracks, the loss drawn
// as a dim connector wedge between columns, drop + median annotated in the
// gaps, big value labels, % gridlines. Replaces the third-party
// components/ui/funnel-chart.tsx (springs, own palette, 24-prop surface) with
// a device drawn in the estate's own ink: one hue, quantized, no animation.
//
// The compact form is the list card's miniature — same geometry, no text.
// ---------------------------------------------------------------------------

const BRAND = '#FD5E0F'
const TRACK = 'rgba(255,255,255,0.025)'
const TRACK_SELECTED = 'rgba(255,255,255,0.05)'
const WEDGE = 'rgba(253,94,15,0.05)'
const WEDGE_EDGE = 'rgba(253,94,15,0.25)'
const GRID = '#1a1a1a'
const BASELINE = '#2b2b2b'
const MUT = '#8a8a8a'
const DIM = '#666666'
const INK_TEXT = '#b3b1ad'

/** House percentage rule: whole numbers from 10%, one decimal below — a 0.4%
 *  funnel must never print "0%". Zero itself is an honest "0%". */
export function formatFunnelPct(pct: number): string {
  return pct >= 10 || pct === 0 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`
}

function stepGlyph(step: FunnelStep) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-neutral-500'
  if (step.category === 'event') return <Lightning className={cls} />
  if (step.value === '/') return <House className={cls} />
  return <FileText className={cls} />
}

interface FunnelColumnsProps {
  steps: FunnelStepStats[]
  /** 1-based selected step (matches ?step=). Ignored in compact mode. */
  selectedStep?: number
  onSelectStep?: (n: number) => void
  /** List-card miniature: no labels, no annotations, 84px tall. */
  compact?: boolean
}

export function FunnelColumns({ steps, selectedStep, onSelectStep, compact }: FunnelColumnsProps) {
  // One gradient def per mounted instance — ids are document-global in SVG.
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const hitRefs = useRef<(HTMLButtonElement | null)[]>([])

  const entered = steps[0]?.visitors ?? 0
  const n = steps.length

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, i: number) => {
      if (!onSelectStep) return
      if (e.key === 'ArrowRight' && i + 1 < n) {
        e.preventDefault()
        onSelectStep(i + 2)
        hitRefs.current[i + 1]?.focus()
      } else if (e.key === 'ArrowLeft' && i > 0) {
        e.preventDefault()
        onSelectStep(i)
        hitRefs.current[i - 1]?.focus()
      }
    },
    [onSelectStep, n],
  )

  if (n === 0 || entered <= 0) return null

  const chartH = compact ? 84 : 280
  const base = compact ? 78 : 250
  const top = compact ? 6 : 42
  const plotH = base - top

  return (
    // ParentSize only calls its child once its own div measures non-zero in
    // BOTH axes, and its div is height:100% — so the height must come from
    // this wrapper, never from the child (a child-sized wrapper deadlocks at
    // 0px and the chart never mounts).
    <div style={{ height: compact ? chartH : chartH + 30 }}>
      <ParentSize>
        {({ width: w }) => {
          if (w <= 0) return <div style={{ height: chartH }} />
          const gridRight = compact ? w : w - 46
          const slotW = w / n
          const colW = Math.min(compact ? 150 : 200, Math.round(slotW * (compact ? 0.45 : 0.52)))
          const colX = (i: number) => Math.round(i * slotW + (slotW - colW) / 2)
          const hOf = (v: number) => Math.max(compact ? 2 : 3, plotH * (v / entered))

          return (
            <div className="relative">
              <svg width={w} height={chartH} style={{ display: 'block' }} aria-hidden="true">
                <defs>
                  <linearGradient id={`fc-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={BRAND} stopOpacity="0.95" />
                    <stop offset="1" stopColor={BRAND} stopOpacity="0.35" />
                  </linearGradient>
                  {!compact && (
                    <filter id={`fcg-${gradId}`} x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="6" />
                    </filter>
                  )}
                </defs>

                {/* % gridlines (full form only) */}
                {!compact &&
                  [25, 50, 75, 100].map((p) => {
                    const y = base - (plotH * p) / 100
                    return (
                      <g key={p}>
                        <line x1={0} x2={gridRight} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                        <text
                          x={w - 40}
                          y={y + 3.5}
                          fontSize={10.5}
                          fill={DIM}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {p}%
                        </text>
                      </g>
                    )
                  })}
                <line x1={0} x2={gridRight} y1={base} y2={base} stroke={BASELINE} strokeWidth={1} />

                {/* connector wedges — the loss, drawn as volume */}
                {steps.slice(0, -1).map((s, i) => {
                  const x1 = colX(i) + colW
                  const x2 = colX(i + 1)
                  const y1 = base - hOf(s.visitors)
                  const y2 = base - hOf(steps[i + 1].visitors)
                  return (
                    <g key={`wedge-${i}`}>
                      <path d={`M ${x1} ${y1} L ${x2} ${y2} L ${x2} ${base} L ${x1} ${base} Z`} fill={WEDGE} />
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={WEDGE_EDGE} strokeWidth={1} />
                    </g>
                  )
                })}

                {/* tracks + columns */}
                {steps.map((s, i) => {
                  const x = colX(i)
                  const h = hOf(s.visitors)
                  const y = base - h
                  const isLast = i === n - 1
                  const isSelected = !compact && selectedStep === i + 1
                  return (
                    <g key={`col-${i}`}>
                      <rect x={x} y={top} width={colW} height={plotH} fill={isSelected ? TRACK_SELECTED : TRACK} />
                      {isLast && !compact && (
                        <rect
                          x={x}
                          y={y}
                          width={colW}
                          height={h}
                          fill={`url(#fc-${gradId})`}
                          filter={`url(#fcg-${gradId})`}
                          opacity={0.55}
                        />
                      )}
                      <rect x={x} y={y} width={colW} height={h} fill={`url(#fc-${gradId})`} />
                      <line x1={x} x2={x + colW} y1={y} y2={y} stroke={BRAND} strokeWidth={compact ? 1.5 : 2} />
                      {!compact && (
                        <>
                          <text
                            x={x}
                            y={Math.max(y - 10, top - 26)}
                            fontSize={20}
                            fontWeight={600}
                            fill="#ffffff"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatNumber(s.visitors)}
                          </text>
                          <text
                            x={x + colW}
                            y={Math.max(y - 10, top - 26)}
                            textAnchor="end"
                            fontSize={11.5}
                            fill={MUT}
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {i === 0 ? '100%' : formatFunnelPct((s.visitors / entered) * 100)}
                          </text>
                        </>
                      )}
                    </g>
                  )
                })}

                {/* drop + median in the gaps */}
                {!compact &&
                  steps.slice(0, -1).map((s, i) => {
                    const lost = s.visitors - steps[i + 1].visitors
                    if (lost <= 0) return null
                    const midX = (colX(i) + colW + colX(i + 1)) / 2
                    const dropPct = Math.round((lost / s.visitors) * 100)
                    // median_step_seconds rides the ARRIVAL step (Steps[i] holds
                    // the i-1 -> i median), so the i -> i+1 gap reads steps[i+1].
                    const med = steps[i + 1].median_step_seconds
                    const yMid = base - (hOf(s.visitors) + hOf(steps[i + 1].visitors)) / 2 - 14
                    const yTxt = Math.min(Math.max(yMid, top + 26), base - 34)
                    return (
                      <g key={`drop-${i}`}>
                        <text
                          x={midX}
                          y={yTxt}
                          textAnchor="middle"
                          fontSize={13}
                          fill={INK_TEXT}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          −{formatNumber(lost)} · {dropPct}%
                        </text>
                        {med != null && (
                          <text x={midX} y={yTxt + 16} textAnchor="middle" fontSize={10.5} fill={DIM}>
                            {formatConvertTime(med)} median
                          </text>
                        )}
                      </g>
                    )
                  })}
              </svg>

              {/* Step labels under the baseline, aligned to column left edges */}
              {!compact &&
                steps.map((s, i) => (
                  <div
                    key={`label-${i}`}
                    className="absolute flex min-w-0 items-baseline gap-1.5"
                    style={{ left: colX(i), top: base + 12, maxWidth: slotW - 16 }}
                  >
                    <span className="text-[11px] tabular-nums text-neutral-500">{i + 1}</span>
                    <span className="relative top-0.5">{stepGlyph(s.step)}</span>
                    <span
                      className={`truncate font-mono text-xs ${selectedStep === i + 1 ? 'text-white' : 'text-neutral-300'}`}
                      title={s.step.value}
                    >
                      {s.step.value}
                    </span>
                    {i === n - 1 && <span className="shrink-0 text-[11px] text-brand-orange">completed</span>}
                  </div>
                ))}

              {/* Step hit areas — real buttons, keyboard-rovable */}
              {!compact && onSelectStep && (
                <div className="absolute inset-x-0 top-0" style={{ height: chartH }} role="group" aria-label="Funnel steps">
                  {steps.map((s, i) => (
                    <button
                      key={`hit-${i}`}
                      ref={(el) => { hitRefs.current[i] = el }}
                      type="button"
                      aria-label={`Step ${i + 1}: ${s.step.value}, ${formatNumber(s.visitors)} sessions`}
                      aria-pressed={selectedStep === i + 1}
                      onClick={() => onSelectStep(i + 1)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className="absolute bottom-0 top-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                      style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        }}
      </ParentSize>
    </div>
  )
}
