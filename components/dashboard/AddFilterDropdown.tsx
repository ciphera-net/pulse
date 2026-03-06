'use client'

import { useState, useRef, useEffect } from 'react'
import { DIMENSIONS, DIMENSION_LABELS, OPERATORS, OPERATOR_LABELS, type DimensionFilter } from '@/lib/filters'

interface AddFilterDropdownProps {
  onAdd: (filter: DimensionFilter) => void
}

type Step = 'dimension' | 'operator' | 'value'

export default function AddFilterDropdown({ onAdd }: AddFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('dimension')
  const [dimension, setDimension] = useState('')
  const [operator, setOperator] = useState<DimensionFilter['operator']>('is')
  const [value, setValue] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        resetState()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function resetState() {
    setStep('dimension')
    setDimension('')
    setOperator('is')
    setValue('')
  }

  function handleSubmit() {
    if (!dimension || !operator || !value.trim()) return
    onAdd({ dimension, operator, values: [value.trim()] })
    setIsOpen(false)
    resetState()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) resetState() }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add filter
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg overflow-hidden">
          {step === 'dimension' && (
            <div className="p-1">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Select dimension
              </div>
              {DIMENSIONS.map(dim => (
                <button
                  key={dim}
                  onClick={() => { setDimension(dim); setStep('operator') }}
                  className="w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                >
                  {DIMENSION_LABELS[dim]}
                </button>
              ))}
            </div>
          )}

          {step === 'operator' && (
            <div className="p-1">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                {DIMENSION_LABELS[dimension]} ...
              </div>
              {OPERATORS.map(op => (
                <button
                  key={op}
                  onClick={() => { setOperator(op); setStep('value') }}
                  className="w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                >
                  {OPERATOR_LABELS[op]}
                </button>
              ))}
            </div>
          )}

          {step === 'value' && (
            <div className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                {DIMENSION_LABELS[dimension]} {OPERATOR_LABELS[operator]}
              </div>
              <input
                autoFocus
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                placeholder="Enter value..."
                className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
              />
              <button
                onClick={handleSubmit}
                disabled={!value.trim()}
                className="w-full mt-2 px-3 py-2 text-sm font-medium bg-brand-orange text-white rounded-lg hover:bg-brand-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Apply filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
