'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretDown, Check } from '@phosphor-icons/react'
import { OPERATORS, OPERATOR_LABELS, type DimensionFilter } from '@/lib/filters'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'

// ---------------------------------------------------------------------------
// OperatorChip — compact token that names the operator and opens a 4-option
// mini-menu. With the menu closed, arrow keys cycle the operator directly
// (Tab → arrows is the keyboard path; no menu round-trip needed).
// ---------------------------------------------------------------------------

export interface OperatorChipProps {
  operator: DimensionFilter['operator']
  onChange: (operator: DimensionFilter['operator']) => void
}

export default function OperatorChip({ operator, onChange }: OperatorChipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const cycle = (delta: 1 | -1) => {
    const index = OPERATORS.indexOf(operator)
    onChange(OPERATORS[(index + delta + OPERATORS.length) % OPERATORS.length])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      cycle(1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      cycle(-1)
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Operator: ${OPERATOR_LABELS[operator]}`}
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-none border transition-colors cursor-pointer ease-apple ${
          open
            ? 'bg-neutral-800 border-brand-orange/40 text-white'
            : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-600'
        }`}
      >
        {OPERATOR_LABELS[operator]}
        <CaretDown className="w-3 h-3 text-neutral-500" weight="bold" />
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="absolute top-full left-0 mt-1 z-10 min-w-[180px] bg-popover border border-border rounded-none shadow-lg py-1 origin-top-left"
        >
          {OPERATORS.map(op => (
            <button
              key={op}
              type="button"
              role="menuitemradio"
              aria-checked={op === operator}
              onClick={() => { onChange(op); setOpen(false) }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition-colors cursor-pointer ease-apple ${
                op === operator ? 'text-brand-orange' : 'text-neutral-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {OPERATOR_LABELS[op]}
              {op === operator && <Check className="w-3.5 h-3.5" weight="bold" />}
            </button>
          ))}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
