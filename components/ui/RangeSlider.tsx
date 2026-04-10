'use client'

import { type ChangeEvent, type PointerEvent as ReactPointerEvent, useCallback, useRef } from 'react'

interface RangeSliderProps {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  valueLabel?: string
  ariaValueText?: string
  className?: string
  ticks?: string[]
  onTickClick?: (index: number) => void
}

export default function RangeSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  valueLabel,
  ariaValueText,
  className = '',
  ticks,
  onTickClick,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  // * Native input kept for keyboard (arrow keys) and screen reader a11y only.
  // * Pointer drag is handled directly on the track below for a reliable hit area.
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(parseInt(e.target.value, 10))
  }

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0
  const hasTicks = !!(ticks && ticks.length > 0)

  // * Convert pointer X to a valid, stepped value
  const pointerToValue = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track) return value
      const rect = track.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const raw = min + pct * (max - min)
      const snapped = Math.round(raw / step) * step
      return Math.max(min, Math.min(max, snapped))
    },
    [min, max, step, value],
  )

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // * Ignore secondary buttons so right-click / middle-click don't start drag
      if (e.button !== 0) return

      e.preventDefault()
      const target = e.currentTarget
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        // * setPointerCapture can throw if the pointer is already captured; safe to ignore
      }

      // * Jump to the clicked position immediately
      const initial = pointerToValue(e.clientX)
      if (initial !== value) onChange(initial)

      const handleMove = (ev: PointerEvent) => {
        const next = pointerToValue(ev.clientX)
        onChange(next)
      }

      const handleUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)
        try {
          target.releasePointerCapture(ev.pointerId)
        } catch {
          // * Ignore if already released
        }
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    },
    [pointerToValue, onChange, value],
  )

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {(label || valueLabel) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              {label}
            </label>
          )}
          {valueLabel && (
            <span className="text-sm font-semibold text-brand-orange tabular-nums">
              {valueLabel}
            </span>
          )}
        </div>
      )}

      {hasTicks && ticks && (
        <div className="relative w-full h-5 mb-2">
          {ticks.map((tick, i) => (
            <button
              key={`${tick}-${i}`}
              type="button"
              onClick={() => onTickClick?.(i)}
              className={`absolute text-xs uppercase tracking-wider -translate-x-1/2 transition-colors ${
                i === value
                  ? 'text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
              style={{ left: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {tick}
            </button>
          ))}
        </div>
      )}

      {/* * Track — pointer events handled here. Height enlarged to 8 (32px) for a fat hit area while the visible track stays thin. */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        className="relative w-full h-8 flex items-center cursor-pointer touch-none select-none"
      >
        {/* * Screen-reader-only native input for keyboard + a11y */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleInputChange}
          aria-label={label || undefined}
          aria-valuetext={ariaValueText}
          className="sr-only"
        />
        {/* Background track */}
        <div className="absolute w-full h-1.5 bg-neutral-700 rounded-full pointer-events-none" />
        {/* Active fill */}
        <div
          className="absolute h-1.5 bg-brand-orange rounded-full pointer-events-none"
          style={{ width: `${percent}%` }}
        />
        {/* Visual handle */}
        <div
          className="absolute w-4 h-4 bg-brand-orange border border-brand-orange-hover rounded-full shadow-lg pointer-events-none -translate-x-1/2"
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  )
}
