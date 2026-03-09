'use client'

import { useState } from 'react'
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

  if (!steps.length) return null

  const maxVisitors = steps[0].visitors
  const n = steps.length

  return (
    <div className={cn('flex gap-6', className)}>
      {/* Left labels */}
      <div className="hidden md:flex flex-col w-40 shrink-0">
        {steps.map((step, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 flex items-center justify-end transition-opacity duration-200',
              hoveredIndex !== null && hoveredIndex !== i && 'opacity-30',
            )}
          >
            <div className="text-right">
              <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                Step {i + 1}
              </span>
              <p className="text-sm font-medium text-neutral-900 dark:text-white truncate max-w-[152px]">
                {step.name}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Funnel segments */}
      <div className="flex-1 flex flex-col min-w-0">
        {steps.map((step, i) => {
          const topPct = maxVisitors > 0
            ? Math.max(30, (step.visitors / maxVisitors) * 100)
            : 100
          const bottomPct = steps[i + 1]
            ? Math.max(30, (steps[i + 1].visitors / maxVisitors) * 100)
            : topPct * 0.7
          const topInset = (100 - topPct) / 2
          const bottomInset = (100 - bottomPct) / 2
          const opacity = Math.max(0.3, 1 - i * (0.55 / n))
          const isHovered = hoveredIndex === i

          return (
            <motion.div
              key={i}
              className="flex-1 relative cursor-default"
              style={{
                backgroundColor: `rgba(253, 94, 15, ${isHovered ? Math.min(1, opacity + 0.15) : opacity})`,
                transition: 'background-color 0.2s',
              }}
              initial={{
                clipPath: 'polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)',
                opacity: 0,
              }}
              animate={{
                clipPath: `polygon(${topInset}% 0%, ${100 - topInset}% 0%, ${100 - bottomInset}% 100%, ${bottomInset}% 100%)`,
                opacity: 1,
              }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          )
        })}
      </div>

      {/* Right stats */}
      <div className="flex flex-col w-28 sm:w-32 shrink-0">
        {steps.map((step, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 flex items-center transition-opacity duration-200',
              hoveredIndex !== null && hoveredIndex !== i && 'opacity-30',
            )}
          >
            <div>
              <p className="text-sm font-bold text-brand-orange">
                {formatNumber(step.visitors)}
              </p>
              {i > 0 ? (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-red-500 dark:text-red-400 font-medium">
                    ↓{Math.round(step.dropoff)}%
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {Math.round(step.conversion)}%
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  baseline
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
