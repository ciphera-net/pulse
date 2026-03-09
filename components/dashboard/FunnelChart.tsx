'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn, formatNumber } from '@ciphera-net/ui'

interface FunnelChartProps {
  steps: Array<{
    name: string
    visitors: number
    dropoff: number
    conversion: number
  }>
  className?: string
}

export default function FunnelChart({ steps, className }: FunnelChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const maxVisitors = steps[0]?.visitors ?? 0
  const n = steps.length

  if (!n || maxVisitors === 0) return null

  // SVG layout
  const W = 800
  const H = 400
  const cx = W / 2
  const maxHW = W * 0.28
  const minHW = 28
  const segH = H / n
  const k = 0.5 // bezier tension

  // n+1 boundary points: top of each step + bottom of last
  const bounds = useMemo(() => {
    return Array.from({ length: n + 1 }, (_, i) => {
      const y = i * segH
      const visitors = i < n ? steps[i].visitors : steps[n - 1].visitors * 0.5
      const hw = Math.max(minHW, (visitors / maxVisitors) * maxHW)
      return { y, hw }
    })
  }, [steps, n, maxVisitors, segH])

  // Curved path for one segment
  const segPath = (i: number) => {
    const t = bounds[i], b = bounds[i + 1]
    const dy = b.y - t.y
    return [
      `M${cx - t.hw},${t.y}`,
      `L${cx + t.hw},${t.y}`,
      `C${cx + t.hw},${t.y + dy * k} ${cx + b.hw},${b.y - dy * k} ${cx + b.hw},${b.y}`,
      `L${cx - b.hw},${b.y}`,
      `C${cx - b.hw},${b.y - dy * k} ${cx - t.hw},${t.y + dy * k} ${cx - t.hw},${t.y}`,
      'Z',
    ].join(' ')
  }

  // Full outline for background glow
  const glowPath = useMemo(() => {
    let d = `M${cx - bounds[0].hw},${bounds[0].y} L${cx + bounds[0].hw},${bounds[0].y}`
    for (let i = 0; i < n; i++) {
      const t = bounds[i], b = bounds[i + 1], dy = b.y - t.y
      d += ` C${cx + t.hw},${t.y + dy * k} ${cx + b.hw},${b.y - dy * k} ${cx + b.hw},${b.y}`
    }
    d += ` L${cx - bounds[n].hw},${bounds[n].y}`
    for (let i = n - 1; i >= 0; i--) {
      const t = bounds[i], b = bounds[i + 1], dy = b.y - t.y
      d += ` C${cx - b.hw},${b.y - dy * k} ${cx - t.hw},${t.y + dy * k} ${cx - t.hw},${t.y}`
    }
    return d + ' Z'
  }, [bounds, n])

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full font-sans"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background glow */}
        <path d={glowPath} fill="rgba(253, 94, 15, 0.07)" />

        {/* Segments */}
        {steps.map((_, i) => {
          const opacity = Math.max(0.45, 1 - i * (0.45 / n))
          const isHovered = hoveredIndex === i
          return (
            <motion.path
              key={i}
              d={segPath(i)}
              fill={`rgba(253, 94, 15, ${isHovered ? Math.min(1, opacity + 0.12) : opacity})`}
              style={{ transition: 'fill 0.2s' }}
              cursor="pointer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: 'easeOut' }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          )
        })}

        {/* Divider lines */}
        {bounds.slice(1, -1).map((b, i) => (
          <line
            key={`div-${i}`}
            x1={cx - b.hw}
            y1={b.y}
            x2={cx + b.hw}
            y2={b.y}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1.5"
          />
        ))}

        {/* Labels */}
        {steps.map((step, i) => {
          const midY = bounds[i].y + segH / 2
          const dimmed = hoveredIndex !== null && hoveredIndex !== i
          return (
            <g
              key={`lbl-${i}`}
              style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.2s' }}
            >
              {/* Visitor count — left */}
              <text
                x={cx - bounds[i].hw - 20}
                y={midY}
                textAnchor="end"
                dominantBaseline="central"
                fill="#FD5E0F"
                fontSize="16"
                fontWeight="700"
              >
                {formatNumber(step.visitors)}
              </text>

              {/* Percentage pill — center */}
              <rect
                x={cx - 23}
                y={midY - 12}
                width={46}
                height={24}
                rx={12}
                fill="rgba(255,255,255,0.2)"
              />
              <text
                x={cx}
                y={midY}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="12"
                fontWeight="600"
              >
                {Math.round(step.conversion)}%
              </text>

              {/* Step name — right */}
              <text
                x={cx + bounds[i].hw + 20}
                y={midY}
                textAnchor="start"
                dominantBaseline="central"
                className="fill-neutral-500 dark:fill-neutral-400"
                fontSize="14"
              >
                {step.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
