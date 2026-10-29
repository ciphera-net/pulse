'use client'

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AnimatedNumber } from '@/components/ui/animated-number'

interface ScoreGaugeProps {
  score: number | null
  label: string
  size?: number
}

// A notched arc: the score lights notches clockwise from the lower left, in
// Lighthouse's own band colour. 270° of track with the gap at the bottom, the
// notches tapering toward the centre (PUL-14, picked from the chart gallery).
const START_ANGLE = 135
const END_ANGLE = 405
const OUTER_RADIUS = 42
const INNER_RADIUS = 28
// Share of the track left as gaps between notches.
const SPACING = 0.25

function getColor(score: number): string {
  if (score >= 90) return '#0cce6b'
  if (score >= 50) return '#ffa400'
  return '#ff4e42'
}

// The full gauge has 40 notches; the 40 px diagnostic-heading gauge would turn
// that into a grey smear, so small gauges use fewer, wider notches.
function notchCount(size: number): number {
  return size >= 80 ? 40 : 20
}

function notchPoints(index: number, total: number): string {
  const totalAngle = END_ANGLE - START_ANGLE
  const notchAngle = (totalAngle * (1 - SPACING)) / total
  const gapAngle = (totalAngle * SPACING) / Math.max(1, total - 1)
  const centre = START_ANGLE + index * (notchAngle + gapAngle) + notchAngle / 2
  const half = ((notchAngle * 0.8) / 2) * (Math.PI / 180)
  const rad = centre * (Math.PI / 180)
  const pt = (r: number, a: number) => `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`
  return [
    pt(OUTER_RADIUS, rad - half),
    pt(OUTER_RADIUS, rad + half),
    pt(INNER_RADIUS, rad + half),
    pt(INNER_RADIUS, rad - half),
  ].join(' ')
}

export default function ScoreGauge({ score, label, size = 120 }: ScoreGaugeProps) {
  const reduceMotion = useReducedMotion()
  const hasScore = score !== null && score !== undefined
  const color = hasScore ? getColor(score) : null
  const total = notchCount(size)
  const lit = hasScore ? Math.round((Math.max(0, Math.min(100, score)) / 100) * total) : 0
  const notches = useMemo(() => Array.from({ length: total }, (_, i) => notchPoints(i, total)), [total])

  const fontSize = size >= 160 ? 'text-4xl' : size >= 100 ? 'text-2xl' : size >= 80 ? 'text-lg' : 'text-xs'
  const labelSize = size >= 100 ? 'text-sm' : 'text-micro-label'
  const gap = size >= 100 ? 'gap-2' : 'gap-1'

  return (
    <div className={`flex flex-col items-center ${gap}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
          {notches.map((points, i) => {
            const active = i < lit
            return (
              <motion.polygon
                key={i}
                points={points}
                // Unlit notches carry the old ring's track grey; lit ones the band.
                className={active ? undefined : 'text-neutral-700'}
                fill={active && color ? color : 'currentColor'}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.2, delay: i * 0.012, ease: 'easeOut' }}
              />
            )
          })}
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center"
          // The number takes the band colour, as the ring's did.
          style={color ? { color } : undefined}
        >
          {hasScore ? (
            <AnimatedNumber
              value={Math.round(score)}
              format={(v) => String(Math.round(v))}
              className={`${fontSize} font-bold tabular-nums`}
            />
          ) : (
            <span className={`${fontSize} font-bold text-neutral-500`}>—</span>
          )}
        </div>
      </div>
      <span className={`${labelSize} font-medium text-neutral-400 text-center`}>
        {label}
      </span>
    </div>
  )
}
