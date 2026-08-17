'use client'

// Funnel chart — adapted from the 21st.dev FunnelChart component.
//
// House adaptations, deliberate and load-bearing:
//  * `motion/react` → `framer-motion` (the dependency this repo already ships;
//    identical API surface for useSpring/useTransform/motion).
//  * local cn() removed → `@/lib/cn` (the server-safe house helper).
//  * shadcn `--chart-*` variables do not exist in this app; defaults are wired
//    to real values (brand orange, border grey) instead of vars that would
//    silently resolve to nothing and render invisible paths.
//  * pct pill: rounded-full + shadow → rounded-none, no shadow (Facet: 0px
//    radius, sharp everywhere).
//  * NaN guard: a funnel whose first stage is 0 used to divide by zero and emit
//    NaN path data. Absence must never render as a broken shape — the chart
//    renders nothing and the page owns the empty state.
//  * selection API added (selectedIndex/onStageSelect + keyboard): the detail
//    page drives ?step= from the canvas, so the chart must be operable — click,
//    Enter/Space, and ArrowLeft/ArrowRight roving, mirroring the FunnelCanvas
//    interaction it replaces.

import { motion, useSpring, useTransform } from 'framer-motion'
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/cn'

// ─── PatternLines ────────────────────────────────────────────────────────────

export interface PatternLinesProps {
  id: string
  width?: number
  height?: number
  stroke?: string
  strokeWidth?: number
  orientation?: ('diagonal' | 'horizontal' | 'vertical')[]
  background?: string
}

export function PatternLines({
  id,
  width = 6,
  height = 6,
  stroke = 'rgba(255,255,255,.25)',
  strokeWidth = 1,
  orientation = ['diagonal'],
  background,
}: PatternLinesProps) {
  const paths: string[] = []

  for (const o of orientation) {
    if (o === 'diagonal') {
      paths.push(`M0,${height}l${width},${-height}`)
      paths.push(`M${-width / 4},${height / 4}l${width / 2},${-height / 2}`)
      paths.push(`M${(3 * width) / 4},${height + height / 4}l${width / 2},${-height / 2}`)
    } else if (o === 'horizontal') {
      paths.push(`M0,${height / 2}l${width},0`)
    } else if (o === 'vertical') {
      paths.push(`M${width / 2},0l0,${height}`)
    }
  }

  return (
    <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse">
      {background && <rect width={width} height={height} fill={background} />}
      <path
        d={paths.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
      />
    </pattern>
  )
}

PatternLines.displayName = 'PatternLines'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FunnelGradientStop {
  offset: string | number
  color: string
}

export interface FunnelStage {
  label: string
  value: number
  displayValue?: string
  color?: string
  gradient?: FunnelGradientStop[]
  /** Optional icon rendered before the step label under the baseline. */
  icon?: ReactNode
  /** Median seconds from the PREVIOUS step to this one — drawn as a pill on the corridor. */
  medianToNextSeconds?: number | null
}

export interface FunnelChartProps {
  data: FunnelStage[]
  orientation?: 'horizontal' | 'vertical'
  color?: string
  layers?: number
  className?: string
  style?: CSSProperties
  showPercentage?: boolean
  showValues?: boolean
  showLabels?: boolean
  hoveredIndex?: number | null
  onHoverChange?: (index: number | null) => void
  /** 0-based selected stage; renders a brand ring and enables keyboard roving. */
  selectedIndex?: number | null
  onStageSelect?: (index: number) => void
  formatPercentage?: (pct: number) => string
  formatValue?: (value: number) => string
  staggerDelay?: number
  gap?: number
  renderPattern?: (id: string, color: string) => ReactNode
  edges?: 'curved' | 'straight'
  labelLayout?: 'spread' | 'grouped'
  labelOrientation?: 'vertical' | 'horizontal'
  labelAlign?: 'center' | 'start' | 'end'
  /** Mini rendering for list rows: values only, no grid labels, no annotations. */
  compact?: boolean
  grid?:
    | boolean
    | {
        bands?: boolean
        bandColor?: string
        lines?: boolean
        lineColor?: string
        lineOpacity?: number
        lineWidth?: number
      }
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const fmtPct = (p: number) => `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`
const fmtVal = (v: number) => v.toLocaleString('en-US')

// * brand-orange; SVG fill props need a concrete value, and the shadcn
// * `--chart-1` variable this shipped with does not exist in this app.
const BRAND = '#FD5E0F'
const BRAND_EDGE = '#ff8a45'
const NEG = '#F8836B'
const MUT = '#8a8a8a'
const DIM_FILL = 'rgba(253,94,15,.15)'
const DIM_STROKE = 'rgba(253,94,15,.32)'
const LOSS_FILL = 'rgba(248,131,107,.08)'
const CORRIDOR_FILL = 'rgba(253,94,15,.20)'
const GRIDLINE = '#1a1a1a'
const BASELINE = '#2b2b2b'

const colSpring = { stiffness: 120, damping: 20, mass: 1 }
const hoverSpring = { stiffness: 300, damping: 24 }

// ─── Column (baseline-anchored, entrance-animated) ───────────────────────────

function Column({
  x, w, base, h, litH, dimmed, delay, color,
}: {
  x: number; w: number; base: number; h: number; litH: number
  dimmed: boolean; delay: number; color: string
}) {
  const grow = useSpring(0, colSpring)
  const scaleY = useTransform(grow, [0, 1], [0, 1])
  const dimOpacity = useSpring(1, hoverSpring)
  useEffect(() => { dimOpacity.set(dimmed ? 0.4 : 1) }, [dimmed, dimOpacity])
  useEffect(() => {
    const id = setTimeout(() => grow.set(1), delay * 1000)
    return () => clearTimeout(id)
  }, [grow, delay])
  const dimH = h - litH
  return (
    <motion.g style={{ opacity: dimOpacity }}>
      <motion.g style={{ scaleY, transformOrigin: `${x + w / 2}px ${base}px` }}>
        {dimH > 0.5 && (
          <rect x={x} y={base - h} width={w} height={dimH} fill={DIM_FILL} stroke={DIM_STROKE} />
        )}
        {litH > 0.5 && (
          <>
            <rect x={x} y={base - litH} width={w} height={litH} fill={color} />
            <line x1={x} y1={base - h} x2={x + w} y2={base - h} stroke={BRAND_EDGE} strokeWidth={2} />
          </>
        )}
        {litH <= 0.5 && dimH > 0.5 && (
          <line x1={x} y1={base - h} x2={x + w} y2={base - h} stroke={DIM_STROKE} strokeWidth={2} />
        )}
      </motion.g>
    </motion.g>
  )
}

// ─── FunnelChart — the approved classic-funnel geometry ──────────────────────
//
// Baseline-anchored columns against a percentage grid; each column splits into
// the survivors who continue (lit) and those who stop there (dim); the gap
// carries a smooth loss curve, the drop stated in people first, and a median
// pill on the survivors' corridor. The 21st.dev skeleton (measurement, springs,
// hover dim, selection + keyboard) is kept; only the drawing changed — its
// symmetric center-axis taper is not the approved design.

export function FunnelChart({
  data,
  color = BRAND,
  className,
  style,
  showValues = true,
  showLabels = true,
  hoveredIndex: hoveredIndexProp,
  onHoverChange,
  selectedIndex = null,
  onStageSelect,
  formatPercentage = fmtPct,
  formatValue = fmtVal,
  staggerDelay = 0.1,
  compact = false,
  grid: gridProp = true,
}: FunnelChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [sz, setSz] = useState({ w: 0, h: 0 })
  const [internalHovered, setInternalHovered] = useState<number | null>(null)

  const isControlled = hoveredIndexProp !== undefined
  const hoveredIndex = isControlled ? hoveredIndexProp : internalHovered
  const setHoveredIndex = useCallback(
    (i: number | null) => {
      if (isControlled) onHoverChange?.(i)
      else setInternalHovered(i)
    },
    [isControlled, onHoverChange],
  )

  const measure = useCallback(() => {
    if (!ref.current) return
    const { width: w, height: h } = ref.current.getBoundingClientRect()
    if (w > 0 && h > 0) setSz({ w, h })
  }, [])
  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [measure])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent, i: number) => {
      if (!onStageSelect) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onStageSelect(i)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const next = e.key === 'ArrowRight' ? Math.min(i + 1, data.length - 1) : Math.max(i - 1, 0)
        onStageSelect(next)
        ref.current?.querySelector<HTMLElement>(`[data-stage="${next}"]`)?.focus()
      }
    },
    [onStageSelect, data.length],
  )

  if (!data.length) return null
  const first = data[0]
  if (!first) return null
  // * A funnel nobody entered has no shape. Absence is never drawn as something.
  if (first.value <= 0) return null

  const n = data.length
  const max = first.value
  const { w: W, h: H } = sz

  // layout
  const padTop = compact ? 22 : 40
  const padBottom = compact ? 8 : (showLabels ? 34 : 14)
  const padLeft = compact ? 4 : 8
  const padRight = compact ? 4 : 46
  const base = H - padBottom
  const maxH = base - padTop
  const colW = compact
    ? Math.min(72, Math.max(34, (W - padLeft - padRight) * 0.16))
    : Math.min(230, Math.max(90, (W - padLeft - padRight) * 0.2))
  const span = n > 1 ? (W - padLeft - padRight - colW) / (n - 1) : 0
  const colX = (i: number) => padLeft + i * span
  const colH = (v: number) => (v <= 0 ? 0 : Math.max(3, (v / max) * maxH))

  const gridEnabled = gridProp !== false && !compact

  return (
    <div
      className={cn('relative w-full select-none', className)}
      ref={ref}
      style={{ aspectRatio: compact ? '8 / 1' : '2.6 / 1', ...style }}
    >
      {W > 0 && H > 0 && (
        <>
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            role="presentation"
            viewBox={`0 0 ${W} ${H}`}
          >
            {gridEnabled &&
              [0, 25, 50, 75, 100].map((p) => {
                const y = base - (maxH * p) / 100
                return (
                  <g key={`grid-${p}`}>
                    <line x1={padLeft} y1={y} x2={W - padRight + 20} y2={y} stroke={GRIDLINE} />
                    <text x={W - 6} y={y + 4} textAnchor="end" fontSize={10.5} fill="#5c5c5c">
                      {p}%
                    </text>
                  </g>
                )
              })}

            {/* connectors: loss curve + survivors corridor per gap */}
            {data.slice(1).map((stage, k) => {
              const i = k + 1
              const hA = colH(data[i - 1].value)
              const hB = colH(stage.value)
              const xA = colX(i - 1) + colW
              const xB = colX(i)
              const yA = base - hA
              const yB = base - hB
              const c = (xB - xA) * 0.42
              return (
                <g key={`conn-${i}`}>
                  <path
                    d={`M${xA},${yA} C ${xA + c},${yA} ${xB - c},${yB} ${xB},${yB} L${xA},${yB} Z`}
                    fill={LOSS_FILL}
                  />
                  {hB > 0.5 && (
                    <path d={`M${xA},${yB} L${xB},${yB} L${xB},${base} L${xA},${base} Z`} fill={CORRIDOR_FILL} />
                  )}
                </g>
              )
            })}

            {/* columns: dim dropped + lit survivors-to-next */}
            {data.map((stage, i) => {
              const h = colH(stage.value)
              const litH = i < n - 1 ? colH(data[i + 1].value) : h
              return (
                <Column
                  base={base}
                  color={stage.color ?? color}
                  delay={i * staggerDelay}
                  dimmed={hoveredIndex !== null && hoveredIndex !== i}
                  h={h}
                  key={`col-${i}`}
                  litH={litH}
                  w={colW}
                  x={colX(i)}
                />
              )
            })}

            <line x1={padLeft} y1={base} x2={W - padRight + 20} y2={base} stroke={BASELINE} />

            {/* per-gap annotations: drop in people + median pill */}
            {!compact &&
              data.slice(1).map((stage, k) => {
                const i = k + 1
                const prev = data[i - 1]
                const lost = prev.value - stage.value
                if (lost <= 0) return null
                const pctDrop = Math.round((lost / prev.value) * 100)
                const midX = (colX(i - 1) + colW + colX(i)) / 2
                const hB = colH(stage.value)
                const median = stage.medianToNextSeconds
                return (
                  <g key={`ann-${i}`}>
                    <text
                      x={midX}
                      y={base - colH(prev.value) * 0.55}
                      textAnchor="middle"
                      fontSize={15}
                      fontWeight={600}
                      fill={NEG}
                    >
                      −{formatValue(lost)}
                    </text>
                    <text
                      x={midX}
                      y={base - colH(prev.value) * 0.55 + 18}
                      textAnchor="middle"
                      fontSize={11.5}
                      fill={NEG}
                    >
                      {pctDrop}% drop
                    </text>
                    {median != null && hB > 14 && (
                      <>
                        <rect x={midX - 52} y={base - hB / 2 - 10} width={104} height={20} fill="#0f0f0f" stroke="#333" />
                        <text
                          x={midX}
                          y={base - hB / 2 + 4}
                          textAnchor="middle"
                          fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
                          fontSize={10.5}
                          fill="#c9c9c9"
                        >
                          {Math.round(median)}s median →
                        </text>
                      </>
                    )}
                  </g>
                )
              })}

            {/* value labels above columns */}
            {showValues &&
              data.map((stage, i) => {
                const y = base - colH(stage.value) - (compact ? 6 : 12)
                const pct = (stage.value / max) * 100
                return (
                  <g key={`val-${i}`}>
                    <text
                      x={colX(i)}
                      y={y}
                      fontSize={compact ? 12.5 : 22}
                      fontWeight={650}
                      fill={stage.value === 0 ? MUT : '#f4f4f4'}
                      letterSpacing="-0.5"
                    >
                      {stage.displayValue ?? formatValue(stage.value)}
                    </text>
                    {!compact && (
                      <text x={colX(i) + (String(stage.displayValue ?? formatValue(stage.value)).length * 13 + 10)} y={y} fontSize={12} fill={MUT}>
                        {i === 0 ? '100%' : formatPercentage(pct)}
                      </text>
                    )}
                  </g>
                )
              })}
          </svg>

          {/* step labels under the baseline — HTML so icons render naturally */}
          {showLabels && !compact && (
            <div className="pointer-events-none absolute inset-x-0" style={{ top: base + 10 }}>
              {data.map((stage, i) => (
                <span
                  key={`step-${i}`}
                  className="absolute inline-flex items-center gap-1.5 font-mono text-xs text-neutral-300"
                  style={{ left: colX(i) }}
                >
                  <span className="text-neutral-500">{i + 1}</span>
                  {stage.icon}
                  {stage.label}
                </span>
              ))}
            </div>
          )}

          {/* hover / selection hit areas */}
          {data.map((stage, i) => {
            const isSelected = selectedIndex === i
            return (
              <motion.div
                animate={{ opacity: hoveredIndex !== null && hoveredIndex !== i ? 0.4 : 1 }}
                aria-label={`Step ${i + 1}: ${stage.label}`}
                aria-pressed={onStageSelect ? isSelected : undefined}
                className={cn(
                  'absolute',
                  onStageSelect
                    ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange'
                    : 'cursor-default',
                  isSelected && 'ring-1 ring-brand-orange/40',
                )}
                data-stage={i}
                key={`hit-${i}`}
                onClick={onStageSelect ? () => onStageSelect(i) : undefined}
                onKeyDown={onStageSelect ? (e) => handleKeyDown(e, i) : undefined}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                role={onStageSelect ? 'button' : undefined}
                style={{ left: colX(i) - 4, width: colW + 8, top: padTop - 26, height: base - padTop + 26 }}
                tabIndex={onStageSelect ? 0 : undefined}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              />
            )
          })}
        </>
      )}
    </div>
  )
}

FunnelChart.displayName = 'FunnelChart'

export default FunnelChart
