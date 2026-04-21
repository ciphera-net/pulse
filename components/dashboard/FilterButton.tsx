'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { DIMENSION_CATEGORIES, DIMENSION_LABELS } from '@/lib/filters'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'

interface FilterButtonProps {
  hasActiveFilters: boolean
  onSelectDimension: (dimension: string) => void
}

export default function FilterButton({ hasActiveFilters, onSelectDimension }: FilterButtonProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({ left: rect.left, top: rect.bottom + 6 })

    const close = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg border shadow-sm transition-[color,background-color,border-color,transform] active:scale-[0.97] cursor-pointer ${
          hasActiveFilters || open
            ? 'bg-brand-orange/10 text-brand-orange border-brand-orange/30'
            : 'bg-neutral-900/80 text-neutral-300 hover:bg-neutral-800 hover:text-white border-white/[0.08]'
        } ease-apple`}
      >
        <MagnifyingGlass className="w-3.5 h-3.5" weight="bold" />
        Filter
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
              className="fixed z-[100] glass-overlay rounded-xl shadow-2xl shadow-black/50 p-3 w-[280px] origin-top-left"
              style={{ left: pos.left, top: pos.top }}
            >
              <div className="grid grid-cols-2 gap-3">
                {DIMENSION_CATEGORIES.map((cat) => (
                  <div key={cat.label}>
                    <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 px-1">{cat.label}</div>
                    {cat.dimensions.map((dim) => (
                      <button
                        key={dim}
                        onClick={() => { onSelectDimension(dim); setOpen(false) }}
                        className="w-full text-left px-2 py-1.5 text-sm text-neutral-300 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer"
                      >
                        {DIMENSION_LABELS[dim]}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
