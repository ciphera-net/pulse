'use client'

import { type ChangeEvent } from 'react'

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
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(parseInt(e.target.value, 10))
  }

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0
  const hasTicks = !!(ticks && ticks.length > 0)

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

      <div className="relative w-full h-4 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          aria-label={label || undefined}
          aria-valuetext={ariaValueText}
          className="absolute w-full h-full opacity-0 cursor-pointer z-10 focus-visible:outline-none"
        />
        {/* Background track */}
        <div className="absolute w-full h-1.5 bg-neutral-700 rounded-full" />
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
