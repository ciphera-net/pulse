'use client'

import { useState, useRef, useEffect } from 'react'

interface Option {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  className?: string
  /** Form-field style (input-like). Default: toolbar style (btn-secondary). */
  variant?: 'default' | 'input'
  /** Shown when value is empty or does not match any option. */
  placeholder?: string
  /** Full-width trigger and panel. Use in form layouts. */
  fullWidth?: boolean
  /** Id for the trigger (e.g. for label htmlFor). */
  id?: string
  /** Alignment of the dropdown panel. */
  align?: 'left' | 'right'
}

export default function Select({
  value,
  onChange,
  options,
  className = '',
  variant = 'default',
  placeholder,
  fullWidth = false,
  id,
  align = 'right',
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find((o) => o.value === value)
  const displayLabel = selectedOption?.label ?? placeholder ?? value ?? ''

  const triggerBase =
    variant === 'input'
      ? 'px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 text-neutral-900 dark:text-white text-left text-sm ' +
        'focus:outline-none focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 transition-all duration-200 ' +
        (isOpen ? 'ring-4 ring-brand-orange/10 border-brand-orange' : '')
      : 'btn-secondary min-w-[140px]'

  const triggerLayout = fullWidth ? 'w-full ' : ''
  const alignClass = align === 'left' ? 'left-0' : 'right-0'
  const panelMinW = fullWidth ? 'w-full' : 'min-w-[140px] w-full'

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''} ${className}`} ref={ref}>
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className={`${triggerLayout}${triggerBase} flex items-center justify-between gap-2`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={!selectedOption && placeholder ? 'text-neutral-500 dark:text-neutral-400' : ''}>
          {displayLabel}
        </span>
        <svg
          className={`w-4 h-4 text-neutral-500 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute ${alignClass} mt-2 ${panelMinW} bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg z-50 overflow-hidden py-1 max-h-60 overflow-y-auto`}
          role="listbox"
        >
          {options.map((option) => (
            <button
              key={option.value}
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors duration-200 flex items-center justify-between
                ${value === option.value
                  ? 'bg-neutral-50 dark:bg-neutral-800 text-brand-orange font-medium'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }
              `}
            >
              {option.label}
              {value === option.value && (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
