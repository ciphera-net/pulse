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

const fmtPct = (p: number) => `${Math.round(p)}%`
const fmtVal = (v: number) => v.toLocaleString('en-US')

const springConfig = { stiffness: 120, damping: 20, mass: 1 }
const hoverSpring = { stiffness: 300, damping: 24 }

// * brand-orange; SVG fill props need a concrete value, and the shadcn
// * `--chart-1` variable this shipped with does not exist in this app.
const BRAND = '#FD5E0F'

// ─── SVG Helpers ─────────────────────────────────────────────────────────────

function hSegmentPath(
  normStart: number,
  normEnd: number,
  segW: number,
  H: number,
  layerScale: number,
  straight = false,
) {
  const my = H / 2
  const h0 = normStart * H * 0.44 * layerScale
  const h1 = normEnd * H * 0.44 * layerScale

  if (straight) {
    return `M 0 ${my - h0} L ${segW} ${my - h1} L ${segW} ${my + h1} L 0 ${my + h0} Z`
  }

  const cx = segW * 0.55
  const top = `M 0 ${my - h0} C ${cx} ${my - h0}, ${segW - cx} ${my - h1}, ${segW} ${my - h1}`
  const bot = `L ${segW} ${my + h1} C ${segW - cx} ${my + h1}, ${cx} ${my + h0}, 0 ${my + h0}`
  return `${top} ${bot} Z`
}

function vSegmentPath(
  normStart: number,
  normEnd: number,
  segH: number,
  W: number,
  layerScale: number,
  straight = false,
) {
  const mx = W / 2
  const w0 = normStart * W * 0.44 * layerScale
  const w1 = normEnd * W * 0.44 * layerScale

  if (straight) {
    return `M ${mx - w0} 0 L ${mx - w1} ${segH} L ${mx + w1} ${segH} L ${mx + w0} 0 Z`
  }

  const cy = segH * 0.55
  const left = `M ${mx - w0} 0 C ${mx - w0} ${cy}, ${mx - w1} ${segH - cy}, ${mx - w1} ${segH}`
  const right = `L ${mx + w1} ${segH} C ${mx + w1} ${segH - cy}, ${mx + w0} ${cy}, ${mx + w0} 0`
  return `${left} ${right} Z`
}

// ─── Animated Ring ───────────────────────────────────────────────────────────

function HRing({
  d,
  color,
  fill,
  opacity,
  hovered,
  ringIndex,
  totalRings,
}: {
  d: string
  color: string
  fill?: string
  opacity: number
  hovered: boolean
  ringIndex: number
  totalRings: number
}) {
  const extraScale = 1 + (ringIndex / Math.max(totalRings - 1, 1)) * 0.12
  const ringSpring = {
    stiffness: 300 - ringIndex * 60,
    damping: 24 - ringIndex * 3,
  }
  const scaleY = useSpring(1, ringSpring)

  useEffect(() => {
    scaleY.set(hovered ? extraScale : 1)
  }, [hovered, scaleY, extraScale])

  return (
    <motion.path
      d={d}
      fill={fill ?? color}
      opacity={opacity}
      style={{ scaleY, transformOrigin: 'center center' }}
    />
  )
}

function VRing({
  d,
  color,
  fill,
  opacity,
  hovered,
  ringIndex,
  totalRings,
}: {
  d: string
  color: string
  fill?: string
  opacity: number
  hovered: boolean
  ringIndex: number
  totalRings: number
}) {
  const extraScale = 1 + (ringIndex / Math.max(totalRings - 1, 1)) * 0.12
  const ringSpring = {
    stiffness: 300 - ringIndex * 60,
    damping: 24 - ringIndex * 3,
  }
  const scaleX = useSpring(1, ringSpring)

  useEffect(() => {
    scaleX.set(hovered ? extraScale : 1)
  }, [hovered, scaleX, extraScale])

  return (
    <motion.path
      d={d}
      fill={fill ?? color}
      opacity={opacity}
      style={{ scaleX, transformOrigin: 'center center' }}
    />
  )
}

// ─── Animated Segments ───────────────────────────────────────────────────────

function HSegment({
  index,
  normStart,
  normEnd,
  segW,
  fullH,
  color,
  layers,
  staggerDelay,
  hovered,
  dimmed,
  renderPattern,
  straight,
  gradientStops,
}: {
  index: number
  normStart: number
  normEnd: number
  segW: number
  fullH: number
  color: string
  layers: number
  staggerDelay: number
  hovered: boolean
  dimmed: boolean
  renderPattern?: (id: string, color: string) => ReactNode
  straight: boolean
  gradientStops?: FunnelGradientStop[]
}) {
  const patternId = `funnel-h-pattern-${index}`
  const gradientId = `funnel-h-grad-${index}`
  const growProgress = useSpring(0, springConfig)
  const entranceScaleX = useTransform(growProgress, [0, 1], [0, 1])
  const entranceScaleY = useTransform(growProgress, [0, 1], [0, 1])
  const dimOpacity = useSpring(1, hoverSpring)

  useEffect(() => {
    dimOpacity.set(dimmed ? 0.4 : 1)
  }, [dimmed, dimOpacity])

  useEffect(() => {
    const timeout = setTimeout(() => growProgress.set(1), index * staggerDelay * 1000)
    return () => clearTimeout(timeout)
  }, [growProgress, index, staggerDelay])

  const rings = Array.from({ length: layers }, (_, l) => {
    const scale = 1 - (l / layers) * 0.35
    const opacity = 0.18 + (l / (layers - 1 || 1)) * 0.65
    return {
      d: hSegmentPath(normStart, normEnd, segW, fullH, scale, straight),
      opacity,
    }
  })

  return (
    <motion.div
      className="pointer-events-none relative shrink-0 overflow-visible"
      style={{
        width: segW,
        height: fullH,
        zIndex: hovered ? 10 : 1,
        opacity: dimOpacity,
      }}
    >
      <motion.div
        className="absolute inset-0 overflow-visible"
        style={{
          scaleX: entranceScaleX,
          scaleY: entranceScaleY,
          transformOrigin: 'left center',
        }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          role="presentation"
          viewBox={`0 0 ${segW} ${fullH}`}
        >
          <defs>
            {gradientStops && (
              <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                {gradientStops.map((stop) => (
                  <stop
                    key={`${stop.offset}-${stop.color}`}
                    offset={
                      typeof stop.offset === 'number' ? `${stop.offset * 100}%` : stop.offset
                    }
                    stopColor={stop.color}
                  />
                ))}
              </linearGradient>
            )}
            {renderPattern?.(patternId, color)}
          </defs>
          {rings.map((r, i) => {
            const isInnermost = i === rings.length - 1
            let ringFill: string | undefined
            if (isInnermost && renderPattern) {
              ringFill = `url(#${patternId})`
            } else if (isInnermost && gradientStops) {
              ringFill = `url(#${gradientId})`
            }
            return (
              <HRing
                color={color}
                d={r.d}
                fill={ringFill}
                hovered={hovered}
                key={`h-ring-${r.opacity.toFixed(2)}`}
                opacity={r.opacity}
                ringIndex={i}
                totalRings={layers}
              />
            )
          })}
        </svg>
      </motion.div>
    </motion.div>
  )
}

function VSegment({
  index,
  normStart,
  normEnd,
  segH,
  fullW,
  color,
  layers,
  staggerDelay,
  hovered,
  dimmed,
  renderPattern,
  straight,
  gradientStops,
}: {
  index: number
  normStart: number
  normEnd: number
  segH: number
  fullW: number
  color: string
  layers: number
  staggerDelay: number
  hovered: boolean
  dimmed: boolean
  renderPattern?: (id: string, color: string) => ReactNode
  straight: boolean
  gradientStops?: FunnelGradientStop[]
}) {
  const patternId = `funnel-v-pattern-${index}`
  const gradientId = `funnel-v-grad-${index}`
  const growProgress = useSpring(0, springConfig)
  const entranceScaleY = useTransform(growProgress, [0, 1], [0, 1])
  const entranceScaleX = useTransform(growProgress, [0, 1], [0, 1])
  const dimOpacity = useSpring(1, hoverSpring)

  useEffect(() => {
    dimOpacity.set(dimmed ? 0.4 : 1)
  }, [dimmed, dimOpacity])

  useEffect(() => {
    const timeout = setTimeout(() => growProgress.set(1), index * staggerDelay * 1000)
    return () => clearTimeout(timeout)
  }, [growProgress, index, staggerDelay])

  const rings = Array.from({ length: layers }, (_, l) => {
    const scale = 1 - (l / layers) * 0.35
    const opacity = 0.18 + (l / (layers - 1 || 1)) * 0.65
    return {
      d: vSegmentPath(normStart, normEnd, segH, fullW, scale, straight),
      opacity,
    }
  })

  return (
    <motion.div
      className="pointer-events-none relative shrink-0 overflow-visible"
      style={{
        width: fullW,
        height: segH,
        zIndex: hovered ? 10 : 1,
        opacity: dimOpacity,
      }}
    >
      <motion.div
        className="absolute inset-0 overflow-visible"
        style={{
          scaleY: entranceScaleY,
          scaleX: entranceScaleX,
          transformOrigin: 'center top',
        }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          role="presentation"
          viewBox={`0 0 ${fullW} ${segH}`}
        >
          <defs>
            {gradientStops && (
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                {gradientStops.map((stop) => (
                  <stop
                    key={`${stop.offset}-${stop.color}`}
                    offset={
                      typeof stop.offset === 'number' ? `${stop.offset * 100}%` : stop.offset
                    }
                    stopColor={stop.color}
                  />
                ))}
              </linearGradient>
            )}
            {renderPattern?.(patternId, color)}
          </defs>
          {rings.map((r, i) => {
            const isInnermost = i === rings.length - 1
            let ringFill: string | undefined
            if (isInnermost && renderPattern) {
              ringFill = `url(#${patternId})`
            } else if (isInnermost && gradientStops) {
              ringFill = `url(#${gradientId})`
            }
            return (
              <VRing
                color={color}
                d={r.d}
                fill={ringFill}
                hovered={hovered}
                key={`v-ring-${r.opacity.toFixed(2)}`}
                opacity={r.opacity}
                ringIndex={i}
                totalRings={layers}
              />
            )
          })}
        </svg>
      </motion.div>
    </motion.div>
  )
}

// ─── Label Overlay ───────────────────────────────────────────────────────────

function SegmentLabel({
  stage,
  pct,
  isHorizontal,
  showValues,
  showPercentage,
  showLabels,
  formatPercentage,
  formatValue,
  index,
  staggerDelay,
  layout = 'spread',
  orientation,
  align = 'center',
}: {
  stage: FunnelStage
  pct: number
  isHorizontal: boolean
  showValues: boolean
  showPercentage: boolean
  showLabels: boolean
  formatPercentage: (p: number) => string
  formatValue: (v: number) => string
  index: number
  staggerDelay: number
  layout?: 'spread' | 'grouped'
  orientation?: 'vertical' | 'horizontal'
  align?: 'center' | 'start' | 'end'
}) {
  const display = stage.displayValue ?? formatValue(stage.value)

  const valueEl = showValues && (
    <span className="whitespace-nowrap font-semibold text-foreground text-sm">{display}</span>
  )
  const pctEl = showPercentage && (
    // * rounded-none, no shadow — Facet chrome is sharp
    <span className="rounded-none bg-foreground px-3 py-1 font-bold text-background text-xs">
      {formatPercentage(pct)}
    </span>
  )
  const labelEl = showLabels && (
    <span className="whitespace-nowrap font-medium text-muted-foreground text-xs">
      {stage.label}
    </span>
  )

  if (layout === 'spread') {
    return (
      <motion.div
        animate={{ opacity: 1 }}
        className={cn(
          'absolute inset-0 flex',
          isHorizontal ? 'flex-col items-center' : 'flex-row items-center',
        )}
        initial={{ opacity: 0 }}
        transition={{
          delay: index * staggerDelay + 0.25,
          duration: 0.35,
          ease: 'easeOut',
        }}
      >
        {isHorizontal ? (
          <>
            <div className="flex h-[16%] items-end justify-center pb-1">{valueEl}</div>
            <div className="flex flex-1 items-center justify-center">{pctEl}</div>
            <div className="flex h-[16%] items-start justify-center pt-1">{labelEl}</div>
          </>
        ) : (
          <>
            <div className="flex w-[16%] items-center justify-end pr-2">{valueEl}</div>
            <div className="flex flex-1 items-center justify-center">{pctEl}</div>
            <div className="flex w-[16%] items-center justify-start pl-2">{labelEl}</div>
          </>
        )}
      </motion.div>
    )
  }

  // Grouped layout
  const resolvedOrientation = orientation ?? (isHorizontal ? 'vertical' : 'horizontal')
  const isVerticalStack = resolvedOrientation === 'vertical'

  const justifyMap = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
  } as const
  const itemsMap = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
  } as const

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={cn(
        'absolute inset-0 flex',
        isHorizontal
          ? cn('flex-col items-center', justifyMap[align])
          : cn('flex-row items-center', justifyMap[align]),
      )}
      initial={{ opacity: 0 }}
      style={{
        padding: isHorizontal ? '8% 0' : '0 8%',
      }}
      transition={{
        delay: index * staggerDelay + 0.25,
        duration: 0.35,
        ease: 'easeOut',
      }}
    >
      <div
        className={cn(
          'flex gap-1.5',
          isVerticalStack
            ? cn('flex-col', itemsMap[isHorizontal ? 'center' : align])
            : cn('flex-row', itemsMap.center),
        )}
      >
        {valueEl}
        {pctEl}
        {labelEl}
      </div>
    </motion.div>
  )
}

// ─── FunnelChart ─────────────────────────────────────────────────────────────

export function FunnelChart({
  data,
  orientation = 'horizontal',
  color = BRAND,
  layers = 3,
  className,
  style,
  showPercentage = true,
  showValues = true,
  showLabels = true,
  hoveredIndex: hoveredIndexProp,
  onHoverChange,
  selectedIndex = null,
  onStageSelect,
  formatPercentage = fmtPct,
  formatValue = fmtVal,
  staggerDelay = 0.12,
  gap = 4,
  renderPattern,
  edges = 'curved',
  labelLayout = 'spread',
  labelOrientation,
  labelAlign = 'center',
  grid: gridProp = false,
}: FunnelChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [sz, setSz] = useState({ w: 0, h: 0 })
  const [internalHoveredIndex, setInternalHoveredIndex] = useState<number | null>(null)

  const isControlled = hoveredIndexProp !== undefined
  const hoveredIndex = isControlled ? hoveredIndexProp : internalHoveredIndex
  const setHoveredIndex = useCallback(
    (index: number | null) => {
      if (isControlled) {
        onHoverChange?.(index)
      } else {
        setInternalHoveredIndex(index)
      }
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

  // * ArrowLeft/ArrowRight roving selection, matching the canvas this replaces.
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
        const sibling = ref.current?.querySelector<HTMLElement>(`[data-stage="${next}"]`)
        sibling?.focus()
      }
    },
    [onStageSelect, data.length],
  )

  if (!data.length) return null

  const first = data[0]
  if (!first) return null

  // * A funnel nobody entered has no shape. Guard the division — NaN path data
  // * renders a broken chart, and absence must never be drawn as something.
  if (first.value <= 0) return null

  const max = first.value
  const n = data.length
  const norms = data.map((d) => d.value / max)
  const horiz = orientation === 'horizontal'
  const { w: W, h: H } = sz

  const totalGap = gap * (n - 1)
  const segW = (W - (horiz ? totalGap : 0)) / n
  const segH = (H - (horiz ? 0 : totalGap)) / n

  // Grid config
  const gridEnabled = gridProp !== false
  const gridCfg = typeof gridProp === 'object' ? gridProp : {}
  const showBands = gridEnabled && (gridCfg.bands ?? true)
  const bandColor = gridCfg.bandColor ?? 'rgba(255,255,255,.03)'
  const showGridLines = gridEnabled && (gridCfg.lines ?? true)
  const gridLineColor = gridCfg.lineColor ?? '#242424'
  const gridLineOpacity = gridCfg.lineOpacity ?? 1
  const gridLineWidth = gridCfg.lineWidth ?? 1

  return (
    <div
      className={cn('relative w-full select-none overflow-visible', className)}
      ref={ref}
      style={{
        aspectRatio: horiz ? '2.2 / 1' : '1 / 1.8',
        ...style,
      }}
    >
      {W > 0 && H > 0 && (
        <>
          {/* Grid background bands */}
          {gridEnabled && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              role="presentation"
              viewBox={`0 0 ${W} ${H}`}
            >
              {showBands &&
                data.map((stage, i) => {
                  if (i % 2 !== 0) return null
                  if (horiz) {
                    const x = (segW + gap) * i
                    return (
                      <rect
                        fill={bandColor}
                        height={H}
                        key={`band-${i}`}
                        width={segW}
                        x={x}
                        y={0}
                      />
                    )
                  }
                  const y = (segH + gap) * i
                  return (
                    <rect
                      fill={bandColor}
                      height={segH}
                      key={`band-${i}`}
                      width={W}
                      x={0}
                      y={y}
                    />
                  )
                })}
            </svg>
          )}

          {/* Segments */}
          <div
            className={cn(
              'absolute inset-0 flex overflow-visible',
              horiz ? 'flex-row' : 'flex-col',
            )}
            style={{ gap }}
          >
            {data.map((stage, i) => {
              const normStart = norms[i] ?? 0
              const normEnd = norms[Math.min(i + 1, n - 1)] ?? 0
              const firstStop = stage.gradient?.[0]
              const segColor = firstStop ? firstStop.color : (stage.color ?? color)

              return horiz ? (
                <HSegment
                  color={segColor}
                  dimmed={hoveredIndex !== null && hoveredIndex !== i}
                  fullH={H}
                  gradientStops={stage.gradient}
                  hovered={hoveredIndex === i}
                  index={i}
                  key={`seg-${i}`}
                  layers={layers}
                  normEnd={normEnd}
                  normStart={normStart}
                  renderPattern={renderPattern}
                  segW={segW}
                  staggerDelay={staggerDelay}
                  straight={edges === 'straight'}
                />
              ) : (
                <VSegment
                  color={segColor}
                  dimmed={hoveredIndex !== null && hoveredIndex !== i}
                  fullW={W}
                  gradientStops={stage.gradient}
                  hovered={hoveredIndex === i}
                  index={i}
                  key={`seg-${i}`}
                  layers={layers}
                  normEnd={normEnd}
                  normStart={normStart}
                  renderPattern={renderPattern}
                  segH={segH}
                  staggerDelay={staggerDelay}
                  straight={edges === 'straight'}
                />
              )
            })}
          </div>

          {/* Grid lines */}
          {gridEnabled && showGridLines && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              role="presentation"
              viewBox={`0 0 ${W} ${H}`}
            >
              {Array.from({ length: n - 1 }, (_, i) => {
                const idx = i + 1
                if (horiz) {
                  const x = segW * idx + gap * i + gap / 2
                  return (
                    <line
                      key={`grid-${idx}`}
                      stroke={gridLineColor}
                      strokeOpacity={gridLineOpacity}
                      strokeWidth={gridLineWidth}
                      x1={x}
                      x2={x}
                      y1={0}
                      y2={H}
                    />
                  )
                }
                const y = segH * idx + gap * i + gap / 2
                return (
                  <line
                    key={`grid-${idx}`}
                    stroke={gridLineColor}
                    strokeOpacity={gridLineOpacity}
                    strokeWidth={gridLineWidth}
                    x1={0}
                    x2={W}
                    y1={y}
                    y2={y}
                  />
                )
              })}
            </svg>
          )}

          {/* Label overlays — hover + selection triggers */}
          {data.map((stage, i) => {
            const pct = (stage.value / max) * 100
            const posStyle: CSSProperties = horiz
              ? { left: (segW + gap) * i, width: segW, top: 0, height: H }
              : { top: (segH + gap) * i, height: segH, left: 0, width: W }
            const isDimmed = hoveredIndex !== null && hoveredIndex !== i
            const isSelected = selectedIndex === i

            return (
              <motion.div
                animate={{ opacity: isDimmed ? 0.4 : 1 }}
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
                key={`lbl-${i}`}
                onClick={onStageSelect ? () => onStageSelect(i) : undefined}
                onKeyDown={onStageSelect ? (e) => handleKeyDown(e, i) : undefined}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                role={onStageSelect ? 'button' : undefined}
                style={{ ...posStyle, zIndex: 20 }}
                tabIndex={onStageSelect ? 0 : undefined}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <SegmentLabel
                  align={labelAlign}
                  formatPercentage={formatPercentage}
                  formatValue={formatValue}
                  index={i}
                  isHorizontal={horiz}
                  layout={labelLayout}
                  orientation={labelOrientation}
                  pct={pct}
                  showLabels={showLabels}
                  showPercentage={showPercentage}
                  showValues={showValues}
                  stage={stage}
                  staggerDelay={staggerDelay}
                />
              </motion.div>
            )
          })}
        </>
      )}
    </div>
  )
}

FunnelChart.displayName = 'FunnelChart'

export default FunnelChart
