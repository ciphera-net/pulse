'use client'

import { type ChangeEvent, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, useCallback, useRef } from 'react'

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
  /** Render visual snap/stop dots at each step position along the track. */
  showStops?: boolean
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
  showStops = false,
}: RangeSliderProps) {
  // * Compute evenly-spaced stop positions when showStops is enabled
  const stops: number[] = []
  if (showStops && step > 0 && max > min) {
    for (let v = min; v <= max; v += step) {
      stops.push(((v - min) / (max - min)) * 100)
    }
  }
  const trackRef = useRef<HTMLDivElement>(null)

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0
  const hasTicks = !!(ticks && ticks.length > 0)

  // * Native input kept for keyboard arrows + screen readers only.
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(parseInt(e.target.value, 10))
  }

  const clientXToValue = useCallback(
    (clientX: number, rect: DOMRect): number => {
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const raw = min + pct * (max - min)
      const snapped = Math.round(raw / step) * step
      return Math.max(min, Math.min(max, snapped))
    },
    [min, max, step],
  )

  // * Drag from the visible handle (this is the proven pattern from the old pricing slider)
  const handleHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()

      const move = (ev: PointerEvent) => {
        onChange(clientXToValue(ev.clientX, rect))
      }
      const up = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.removeEventListener('pointercancel', up)
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
      document.addEventListener('pointercancel', up)
    },
    [clientXToValue, onChange],
  )

  // * Click anywhere on the track jumps to that position.
  // * Uses onClick (not onPointerDown) so it doesn't fight with the handle's drag logic.
  const handleTrackClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const track = trackRef.current
      if (!track) return
      // * If the click came from inside the handle, ignore — handle owns its own pointer events
      if ((e.target as HTMLElement).dataset.sliderHandle === 'true') return
      const rect = track.getBoundingClientRect()
      const next = clientXToValue(e.clientX, rect)
      if (next !== value) onChange(next)
    },
    [clientXToValue, onChange, value],
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

      {/* Track — clicking jumps to position; the handle owns its own drag. */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative w-full h-6 flex items-center cursor-pointer touch-none select-none"
      >
        {/* Screen-reader-only native input for keyboard accessibility */}
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
        {/* Snap/stop dots */}
        {showStops && stops.map((pct, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-neutral-500 pointer-events-none -translate-x-1/2"
            style={{ left: `${pct}%` }}
          />
        ))}
        {/* Visual handle — pill-shaped, big enough to grab easily */}
        <div
          data-slider-handle="true"
          onPointerDown={handleHandlePointerDown}
          className="absolute w-8 h-5 bg-brand-orange border border-brand-orange-hover rounded-full shadow-lg cursor-grab active:cursor-grabbing -translate-x-1/2 flex items-center justify-center gap-0.5"
          style={{ left: `${percent}%` }}
        >
          <div className="w-0.5 h-2 rounded-sm bg-white/60 pointer-events-none" />
          <div className="w-0.5 h-2 rounded-sm bg-white/60 pointer-events-none" />
        </div>
      </div>
    </div>
  )
}
