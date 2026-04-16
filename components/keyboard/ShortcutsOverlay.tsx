'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { XIcon } from '@ciphera-net/ui'
import { SPRING, TIMING } from '@/lib/motion'

interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

interface ShortcutRow {
  keys: string[]
  label: string
}

const NAVIGATION: ShortcutRow[] = [
  { keys: ['g', 'h'], label: 'Home (your sites)' },
  { keys: ['g', 'd'], label: 'Dashboard' },
  { keys: ['g', 'j'], label: 'Journeys' },
  { keys: ['g', 'f'], label: 'Funnels' },
  { keys: ['g', 'b'], label: 'Behavior' },
  { keys: ['g', 's'], label: 'Search' },
  { keys: ['g', 'c'], label: 'CDN' },
  { keys: ['g', 'u'], label: 'Uptime' },
  { keys: ['g', 'p'], label: 'PageSpeed' },
  { keys: ['g', 'i'], label: 'Integrations' },
  { keys: ['g', 'n'], label: 'Notifications' },
]

const ACTIONS: ShortcutRow[] = [
  { keys: [','], label: 'Open settings' },
  { keys: ['?'], label: 'Show this overlay' },
  { keys: ['Esc'], label: 'Close modal / dropdown' },
]

function Kbd({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-neutral-800/70 border border-white/[0.08] text-xs font-medium text-neutral-300 font-mono">
      {label}
    </kbd>
  )
}

function Row({ shortcut }: { shortcut: ShortcutRow }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-neutral-300">{shortcut.label}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            <Kbd label={k} />
            {i < shortcut.keys.length - 1 && <span className="text-neutral-600 text-xs">then</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Keyboard shortcuts reference modal. Opens on `?`, dismisses on Esc or click-outside.
 * Portal-rendered to escape any parent overflow clipping.
 */
export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TIMING}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-2xl glass-overlay rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
                <h2 className="text-title-2 font-semibold text-white">Keyboard shortcuts</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-neutral-400 hover:text-white transition-colors duration-fast ease-apple p-1 rounded-md cursor-pointer"
                  aria-label="Close"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 px-6 py-4">
                <div>
                  <h3 className="text-micro-label font-semibold text-neutral-500 mb-2">Navigation</h3>
                  <div className="divide-y divide-white/[0.04]">
                    {NAVIGATION.map((s) => <Row key={s.label} shortcut={s} />)}
                  </div>
                </div>
                <div>
                  <h3 className="text-micro-label font-semibold text-neutral-500 mb-2 mt-6 md:mt-0">Actions</h3>
                  <div className="divide-y divide-white/[0.04]">
                    {ACTIONS.map((s) => <Row key={s.label} shortcut={s} />)}
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 border-t border-white/[0.08] text-xs text-neutral-500 text-center">
                Press <Kbd label="Esc" /> to close
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
