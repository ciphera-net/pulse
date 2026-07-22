'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Plus } from '@phosphor-icons/react'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { cn } from '@/lib/utils'

/** Clamp value + delta·step onto the [min, max] grid anchored at min. */
export function clampStep(value: number, delta: number, min: number, max: number, step: number): number {
  const next = value + delta * step
  const snapped = Math.round((next - min) / step) * step + min
  if (snapped < min) return min
  if (snapped > max) return max
  return snapped
}

interface StepperControlProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  className?: string
}

const HOLD_DELAY_MS = 400
const HOLD_INTERVAL_MS = 80

/**
 * h-10 labeled spinbutton — the toolbar-row replacement for sliders over
 * small discrete ranges. Neutral chrome (label mono 12px sentence case,
 * white tabular value); no orange. Keyboard: arrows step, Home/End jump.
 */
export function StepperControl({ label, value, min, max, step = 1, onChange, format, className }: StepperControlProps) {
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdInterval = React.useRef<ReturnType<typeof setInterval> | null>(null)
  // * Refs so a held button keeps stepping against the latest value
  const valueRef = React.useRef(value)
  valueRef.current = value

  const change = React.useCallback(
    (delta: number) => {
      const next = clampStep(valueRef.current, delta, min, max, step)
      if (next !== valueRef.current) onChange(next)
    },
    [min, max, step, onChange],
  )

  const stopHold = React.useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (holdInterval.current) clearInterval(holdInterval.current)
    holdTimer.current = null
    holdInterval.current = null
  }, [])

  const startHold = React.useCallback(
    (delta: number) => {
      change(delta)
      holdTimer.current = setTimeout(() => {
        holdInterval.current = setInterval(() => change(delta), HOLD_INTERVAL_MS)
      }, HOLD_DELAY_MS)
    },
    [change],
  )

  React.useEffect(() => stopHold, [stopHold])

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault()
        change(1)
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault()
        change(-1)
        break
      case 'Home':
        e.preventDefault()
        if (value !== min) onChange(min)
        break
      case 'End':
        e.preventDefault()
        if (value !== max) onChange(max)
        break
    }
  }

  const display = format ? format(value) : String(value)

  return (
    <div
      role="spinbutton"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex h-10 select-none items-center gap-1.5 rounded-none border border-neutral-800 bg-transparent px-2.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange',
        className,
      )}
    >
      <span className="text-xs text-neutral-500 pr-0.5">{label}</span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={value <= min}
        onPointerDown={(e) => { if (e.button === 0) startHold(-1) }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className="p-1 rounded-none text-neutral-500 transition-colors duration-fast ease-apple hover:text-white disabled:pointer-events-none disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="relative inline-flex min-w-[2ch] justify-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={display}
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className="text-sm font-semibold tabular-nums text-white"
          >
            {display}
          </motion.span>
        </AnimatePresence>
      </span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={value >= max}
        onPointerDown={(e) => { if (e.button === 0) startHold(1) }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className="p-1 rounded-none text-neutral-500 transition-colors duration-fast ease-apple hover:text-white disabled:pointer-events-none disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
