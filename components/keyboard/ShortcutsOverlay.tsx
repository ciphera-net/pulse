'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { XIcon } from '@ciphera-net/facet'
import { SPRING, TIMING } from '@/lib/motion'
import { PERIOD_PRESETS } from '@/lib/constants/periods'
import { CUSTOM_RANGE_KEY, FILTER_KEY, KEYBOARD_SHORTCUTS_FLAG, RANGE_KEYS, REALTIME_KEY, keyCap } from '@/lib/keyboard/shortcuts'
import { useFeature } from '@/lib/features'

interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

interface ShortcutRow {
  keys: string[]
  label: string
}

// 🔴 Mirrors ShortcutHandler's SITE_KEY_MAP by hand. It said `g p` for Performance from 22-09-2026, when that key
// moved to Pages and Performance took `g r`, until 16-11-2026 (components/keyboard/__tests__ checks both now).
export const NAVIGATION: ShortcutRow[] = [
  { keys: ['g', 'h'], label: 'Home (your sites)' },
  { keys: ['g', 'd'], label: 'Dashboard' },
  { keys: ['g', 'p'], label: 'Pages' },
  { keys: ['g', 'j'], label: 'Journeys' },
  { keys: ['g', 'v'], label: 'Visitors' },
  { keys: ['g', 'f'], label: 'Funnels' },
  { keys: ['g', 's'], label: 'Search' },
  { keys: ['g', 'c'], label: 'CDN' },
  { keys: ['g', 'u'], label: 'Uptime' },
  { keys: ['g', 'r'], label: 'Performance' },
  { keys: ['g', 'i'], label: 'Integrations' },
]

// The date menu's rows in its own order, each with the letter its cap shows (lib/keyboard/shortcuts.ts). A row with
// no letter (Last year) is not listed.
export const DATE_RANGE: ShortcutRow[] = [
  ...PERIOD_PRESETS.filter((p) => RANGE_KEYS[p.key]).map((p) => ({ keys: [keyCap(RANGE_KEYS[p.key])], label: p.label })),
  { keys: [keyCap(CUSTOM_RANGE_KEY)], label: 'Custom range' },
  { keys: [keyCap(REALTIME_KEY)], label: 'Realtime' },
  { keys: ['←'], label: 'Previous period' },
  { keys: ['→'], label: 'Next period' },
]

export const FILTER: ShortcutRow[] = [
  { keys: [keyCap(FILTER_KEY)], label: 'Open the filter' },
]

const ACTIONS: ShortcutRow[] = [
  { keys: [','], label: 'Go to settings' },
  { keys: ['?'], label: 'Show this overlay' },
  { keys: ['Esc'], label: 'Close modal / dropdown' },
]

function Kbd({ label }: { label: string }) {
  return (
    // font-sans: a <kbd> takes the browser's monospace face unless told otherwise, and a key's name is not code (the
    // Filter button's and the date menu's caps are sans too).
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-none bg-neutral-800/70 border border-neutral-800 font-sans text-xs font-medium text-neutral-300">
      {label}
    </kbd>
  )
}

function Row({ shortcut }: { shortcut: ShortcutRow }) {
  return (
    <div className="flex items-center justify-between py-1.5">
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
  // The date range's keys are a beta; F is older and listed for everyone.
  const rangeKeys = useFeature(KEYBOARD_SHORTCUTS_FLAG) === true
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
            className="fixed inset-0 z-[100] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-none border border-border bg-card">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                <h2 className="text-title-2 font-semibold text-white">Keyboard shortcuts</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-neutral-400 hover:text-white transition-colors duration-fast ease-apple p-1 rounded-none cursor-pointer"
                  aria-label="Close"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="grid min-h-0 grid-cols-1 gap-x-8 overflow-y-auto px-6 py-4 md:grid-cols-2">
                <div>
                  <h3 className="text-micro-label font-semibold text-neutral-500 mb-2">Navigation</h3>
                  <div className="divide-y divide-white/[0.04]">
                    {NAVIGATION.map((s) => <Row key={s.label} shortcut={s} />)}
                  </div>
                  <h3 className="text-micro-label font-semibold text-neutral-500 mb-2 mt-6">Actions</h3>
                  <div className="divide-y divide-white/[0.04]">
                    {ACTIONS.map((s) => <Row key={s.label} shortcut={s} />)}
                  </div>
                </div>
                <div>
                  {rangeKeys && (
                    <>
                      <h3 className="text-micro-label font-semibold text-neutral-500 mb-2 mt-6 md:mt-0">Date range</h3>
                      <div className="divide-y divide-white/[0.04]" data-shortcuts-section="date-range">
                        {DATE_RANGE.map((s) => <Row key={s.label} shortcut={s} />)}
                      </div>
                    </>
                  )}
                  <h3 className={`text-micro-label font-semibold text-neutral-500 mb-2 ${rangeKeys ? 'mt-6' : 'mt-6 md:mt-0'}`}>Filter</h3>
                  <div className="divide-y divide-white/[0.04]" data-shortcuts-section="filter">
                    {FILTER.map((s) => <Row key={s.label} shortcut={s} />)}
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 border-t border-neutral-800 text-xs text-neutral-500 text-center">
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
