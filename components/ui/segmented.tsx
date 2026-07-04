'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  ariaLabel: string
  className?: string
}

/**
 * h-10 segmented control — sharp, neutral (active cell = raised neutral, not
 * orange). Roving tabindex: the active cell is the tab stop; ←/→ move and
 * select.
 */
export function Segmented<T extends string>({ value, onChange, options, ariaLabel, className }: SegmentedProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let target: number | null = null
    if (e.key === 'ArrowRight') target = (index + 1) % options.length
    if (e.key === 'ArrowLeft') target = (index - 1 + options.length) % options.length
    if (target === null) return
    e.preventDefault()
    onChange(options[target].value)
    refs.current[target]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex h-10 items-stretch overflow-hidden rounded-none border border-neutral-800', className)}
    >
      {options.map((opt, i) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex items-center gap-1.5 px-3 text-sm font-medium transition-colors duration-fast ease-apple rounded-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange',
              i > 0 && 'border-l border-neutral-800',
              active ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
