'use client'

import { useState } from 'react'
import { Modal } from '@ciphera-net/ui'
import { DIMENSIONS, DIMENSION_LABELS, OPERATORS, OPERATOR_LABELS, type DimensionFilter } from '@/lib/filters'

interface AddFilterDropdownProps {
  onAdd: (filter: DimensionFilter) => void
}

export default function AddFilterDropdown({ onAdd }: AddFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dimension, setDimension] = useState('')
  const [operator, setOperator] = useState<DimensionFilter['operator']>('is')
  const [value, setValue] = useState('')

  function resetState() {
    setDimension('')
    setOperator('is')
    setValue('')
  }

  function handleOpen() {
    resetState()
    setIsOpen(true)
  }

  function handleSubmit() {
    if (!dimension || !operator || !value.trim()) return
    onAdd({ dimension, operator, values: [value.trim()] })
    setIsOpen(false)
    resetState()
  }

  const hasDimension = dimension !== ''

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filter
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Add Filter">
        {!hasDimension ? (
          <div className="grid grid-cols-2 gap-2">
            {DIMENSIONS.map(dim => (
              <button
                key={dim}
                onClick={() => setDimension(dim)}
                className="text-left px-4 py-3 text-sm font-medium rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-brand-orange hover:text-brand-orange dark:hover:border-brand-orange dark:hover:text-brand-orange transition-colors cursor-pointer"
              >
                {DIMENSION_LABELS[dim]}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Selected dimension header */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setDimension(''); setOperator('is'); setValue('') }}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                {DIMENSION_LABELS[dimension]}
              </span>
            </div>

            {/* Operator selection */}
            <div className="flex gap-2 flex-wrap">
              {OPERATORS.map(op => (
                <button
                  key={op}
                  onClick={() => setOperator(op)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    operator === op
                      ? 'bg-brand-orange text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  {OPERATOR_LABELS[op]}
                </button>
              ))}
            </div>

            {/* Value input */}
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              placeholder={`Enter ${DIMENSION_LABELS[dimension].toLowerCase()} value...`}
              className="w-full px-4 py-3 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-colors"
            />

            {/* Apply */}
            <button
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="w-full px-4 py-3 text-sm font-semibold bg-brand-orange text-white rounded-xl hover:bg-brand-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
