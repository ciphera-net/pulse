'use client'

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@ciphera-net/facet'

export interface SelectOption {
  value: string
  label: string
  divider?: boolean
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  /** Form-field style (input-like). Default: toolbar style (secondary button). */
  variant?: 'default' | 'input' | 'ghost'
  /** Shown when value is empty or does not match any option. */
  placeholder?: string
  /** Full-width trigger and panel. Use in form layouts. */
  fullWidth?: boolean
  /** Id for the trigger (e.g. for label htmlFor). */
  id?: string
  /** Alignment of the dropdown panel. */
  align?: 'left' | 'right'
  /** Prevent interaction. */
  disabled?: boolean
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
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selectableOptions = options.filter((o) => !o.divider)

  // Reset highlight when opening
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((o) => o.value === value)
      setHighlightedIndex(idx >= 0 ? idx : 0)
    }
  }, [isOpen, options, value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setIsOpen(true)
          return
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          let next = (highlightedIndex + 1) % options.length
          while (options[next]?.divider) next = (next + 1) % options.length
          setHighlightedIndex(next)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          let prev = (highlightedIndex - 1 + options.length) % options.length
          while (options[prev]?.divider) prev = (prev - 1 + options.length) % options.length
          setHighlightedIndex(prev)
          break
        }
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (highlightedIndex >= 0 && highlightedIndex < options.length && !options[highlightedIndex]?.divider) {
            onChange(options[highlightedIndex].value)
            setIsOpen(false)
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          break
      }
    },
    [isOpen, highlightedIndex, options, onChange]
  )

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && panelRef.current && highlightedIndex >= 0) {
      const items = panelRef.current.querySelectorAll('[role="option"]')
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, isOpen])

  const selectedOption = selectableOptions.find((o) => o.value === value)
  const displayLabel = selectedOption?.label ?? placeholder ?? value ?? ''

  const triggerBase =
    variant === 'input'
      ? cn(
          'min-w-0 px-3 h-10 border border-input rounded-none bg-transparent text-foreground text-left text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange transition-colors',
          isOpen && 'ring-2 ring-brand-orange border-brand-orange'
        )
      : variant === 'ghost'
        ? cn(
            'px-4 h-full w-full bg-transparent text-muted-foreground text-center text-sm border-0 rounded-none',
            'hover:bg-white/[0.06] focus-visible:outline-none transition-colors duration-200'
          )
        : cn(
            'min-w-[140px] px-3.5 h-9 border border-border bg-secondary text-secondary-foreground rounded-none text-sm',
            'hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors',
            isOpen && 'ring-1 ring-ring'
          )

  const triggerLayout = 'w-full '
  const highlightedId = highlightedIndex >= 0 ? `select-option-${options[highlightedIndex]?.value}` : undefined

  // * Dropdown is portalled to the body with fixed positioning so it never
  // * clips inside a scrollable ancestor (dialogs, cards). Position is measured
  // * from the trigger and kept in sync while open.
  const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number }>()

  const measure = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect()
    if (!t) return
    const gap = 4
    const spaceBelow = window.innerHeight - t.bottom
    const spaceAbove = t.top
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
    const maxH = Math.min(448, (openUp ? spaceAbove : spaceBelow) - gap - 8)
    setCoords({
      left: t.left,
      width: t.width,
      maxH,
      ...(openUp ? { bottom: window.innerHeight - t.top + gap } : { top: t.bottom + gap }),
    })
  }, [])

  useLayoutEffect(() => {
    if (isOpen) measure()
  }, [isOpen, measure])

  useEffect(() => {
    if (!isOpen) return
    const onScrollOrResize = () => measure()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [isOpen, measure])

  // * Outside-click must ignore the portalled panel, not just the trigger.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`relative ${fullWidth || variant === 'ghost' ? 'w-full h-full' : ''} ${className}`} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={disabled ? undefined : handleKeyDown}
        className={`${triggerLayout}${triggerBase} flex items-center ${variant === 'ghost' ? 'justify-center' : 'justify-between'} gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-activedescendant={isOpen ? highlightedId : undefined}
      >
        <span className={cn('truncate', !selectedOption && placeholder ? 'text-muted-foreground' : '')}>
          {displayLabel}
        </span>
        <svg
          className={cn(
            'w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && coords && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="fixed bg-popover border border-border rounded-none shadow-lg z-[300] overflow-y-auto py-1"
                style={{
                  left: coords.left,
                  width: coords.width,
                  minWidth: Math.max(coords.width, 140),
                  top: coords.top,
                  bottom: coords.bottom,
                  maxHeight: coords.maxH,
                }}
                role="listbox"
              >
                {options.map((option, index) => option.divider ? (
                  <div key={`divider-${index}`} className="my-1 border-t border-border" role="separator" />
                ) : (
                  <button
                    type="button"
                    key={option.value}
                    id={`select-option-${option.value}`}
                    role="option"
                    aria-selected={value === option.value}
                    onClick={() => {
                      onChange(option.value)
                      setIsOpen(false)
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors duration-100 flex items-center justify-between gap-2 rounded-none',
                      value === option.value
                        ? 'text-brand-orange font-medium'
                        : 'text-popover-foreground',
                      highlightedIndex === index && 'bg-accent'
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {value === option.value && (
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
