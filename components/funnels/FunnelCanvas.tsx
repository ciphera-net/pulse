'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, House, Lightning } from '@phosphor-icons/react'
import type { FunnelStepStats } from '@/lib/api/funnels'
import { formatNumber } from '@/lib/utils/format'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'

// ---------------------------------------------------------------------------
// Funnel canvas — equal-width step columns with vertical level rails filled
// bottom-up to each step's conversion-of-start, connected by SVG trapezoid
// bands (measured from the real rail rects). Clicking or arrowing between
// columns drives ?step= on the detail page; drops read red in the gutters.
// Below md the columns stack and the bands become short vertical connectors.
// ---------------------------------------------------------------------------

interface FunnelCanvasProps {
  steps: FunnelStepStats[]
  /** 1-based selected step (matches ?step=). */
  selectedStep: number
  onSelectStep: (step: number) => void
}

interface BandGeometry {
  key: number
  points: string
}

function stepGlyph(category: string | undefined, value: string) {
  const cls = 'h-4 w-4 shrink-0 text-neutral-500'
  if (category === 'event') return <Lightning className={cls} />
  if (value === '/') return <House className={cls} />
  return <FileText className={cls} />
}

export function FunnelCanvas({ steps, selectedStep, onSelectStep }: FunnelCanvasProps) {
  const railsRef = useRef<HTMLDivElement>(null)
  const [bands, setBands] = useState<BandGeometry[]>([])
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 })

  const startVisitors = steps[0]?.visitors ?? 0
  const fillPct = useCallback(
    (i: number) => {
      if (startVisitors === 0) return 0
      // * conversion is already % of the entry step; clamp against drift
      return Math.max(0, Math.min(100, steps[i].conversion))
    },
    [steps, startVisitors],
  )

  // * Bands connect adjacent fill levels — measured off the real rail rects so
  // * they stay glued through resizes and stat morphs. md+ only (CSS hides the
  // * overlay when columns stack).
  useLayoutEffect(() => {
    const container = railsRef.current
    if (!container) return
    const measure = () => {
      const containerRect = container.getBoundingClientRect()
      const rails = container.querySelectorAll<HTMLElement>('[data-rail]')
      if (rails.length < 2) {
        setBands([])
        return
      }
      setOverlaySize({ width: containerRect.width, height: containerRect.height })
      const next: BandGeometry[] = []
      for (let i = 0; i < rails.length - 1; i++) {
        const a = rails[i].getBoundingClientRect()
        const b = rails[i + 1].getBoundingClientRect()
        const x1 = a.right - containerRect.left
        const x2 = b.left - containerRect.left
        const aBottom = a.bottom - containerRect.top
        const bBottom = b.bottom - containerRect.top
        const y1 = aBottom - (a.height * fillPct(i)) / 100
        const y2 = bBottom - (b.height * fillPct(i + 1)) / 100
        next.push({
          key: i,
          points: `${x1},${y1} ${x2},${y2} ${x2},${bBottom} ${x1},${aBottom}`,
        })
      }
      setBands(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [steps, fillPct])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const next = Math.max(1, Math.min(steps.length, selectedStep + (e.key === 'ArrowRight' ? 1 : -1)))
      if (next !== selectedStep) {
        onSelectStep(next)
        railsRef.current
          ?.querySelector<HTMLButtonElement>(`button[data-step="${next}"]`)
          ?.focus()
      }
    },
    [steps.length, selectedStep, onSelectStep],
  )

  if (steps.length === 0) return null

  return (
    <div className="rounded-none border border-border bg-card p-5">
      {startVisitors === 0 && (
        <p className="mb-4 text-sm text-neutral-500">No visitors in this period yet.</p>
      )}
      <div
        ref={railsRef}
        className="relative flex flex-col gap-3 md:flex-row md:gap-0"
        role="group"
        aria-label="Funnel steps"
        onKeyDown={onKeyDown}
      >
        {/* Bands overlay — md+ only; hidden when columns stack */}
        {bands.length > 0 && (
          <svg
            width={overlaySize.width}
            height={overlaySize.height}
            className="pointer-events-none absolute left-0 top-0 hidden md:block"
            aria-hidden="true"
          >
            {bands.map((band, i) => (
              <motion.polygon
                key={band.key}
                points={band.points}
                className="fill-brand-orange/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: DURATION_BASE,
                  ease: EASE_APPLE,
                  delay: Math.min(0.06 + i * 0.03, 0.12),
                }}
              />
            ))}
          </svg>
        )}

        {steps.map((step, i) => {
          const stepNo = i + 1
          const selected = selectedStep === stepNo
          const pct = fillPct(i)
          const dropped = i > 0 ? Math.max(0, steps[i - 1].visitors - step.visitors) : 0
          const customName = /^Step \d+$/.test(step.step.name) ? null : step.step.name

          return (
            <div key={`${step.step.value}-${i}`} className="flex min-w-0 flex-1 flex-col md:px-3">
              <button
                type="button"
                data-step={stepNo}
                aria-pressed={selected}
                aria-label={`Step ${stepNo}: ${step.step.value} — ${formatNumber(step.visitors)} visitors`}
                onClick={() => onSelectStep(stepNo)}
                className={`group flex min-w-0 flex-col rounded-none border p-3 text-left transition-colors duration-fast ease-apple
                  ${selected ? 'border-transparent ring-1 ring-brand-orange/40' : 'border-transparent hover:bg-neutral-800/40'}
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange`}
              >
                {/* Header — fixed height so the rails align across columns */}
                <div className="min-h-[72px]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-none bg-neutral-800 text-[10px] font-medium text-neutral-400">
                      {stepNo}
                    </span>
                    {stepGlyph(step.step.category, step.step.value)}
                    <span
                      className={`truncate text-sm font-medium ${selected ? 'text-white' : 'text-neutral-300'}`}
                      title={step.step.value}
                    >
                      {step.step.value}
                    </span>
                  </div>
                  {customName && (
                    <p className="ml-7 mt-0.5 truncate text-xs text-neutral-500" title={customName}>
                      {customName}
                    </p>
                  )}
                  <div className="ml-7 mt-1 flex items-baseline gap-1.5">
                    <span className="text-base font-semibold tabular-nums text-white">
                      {formatNumber(step.visitors)}
                    </span>
                    <span className="text-xs tabular-nums text-neutral-500">
                      {Math.round(pct)}%
                    </span>
                  </div>
                </div>

                {/* Level rail */}
                <div data-rail className="relative h-40 w-full overflow-hidden rounded-none bg-neutral-800/40">
                  {pct > 0 && (
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 bg-brand-orange/20"
                      initial={{ height: 0 }}
                      animate={{ height: `${pct}%` }}
                      transition={{
                        duration: DURATION_BASE,
                        ease: EASE_APPLE,
                        delay: Math.min(i * 0.03, 0.12),
                      }}
                    >
                      <div className="h-0.5 w-full bg-brand-orange" />
                    </motion.div>
                  )}
                </div>

                {/* Drop label — under the rail, reads with the gutter band */}
                {i > 0 && (dropped > 0 || step.dropoff > 0) ? (
                  <span className="mt-2 text-xs font-medium tabular-nums text-red-400">
                    −{formatNumber(dropped)} · {Math.round(step.dropoff)}% drop
                  </span>
                ) : (
                  <span className="mt-2 text-xs text-transparent" aria-hidden="true">
                    &nbsp;
                  </span>
                )}
              </button>

              {/* Mobile connector between stacked columns */}
              {i < steps.length - 1 && (
                <div className="mx-auto mt-1 h-5 w-0.5 bg-brand-orange/20 md:hidden" aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
