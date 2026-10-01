'use client'

import { type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// The blocks' page-flip motion (A2 cascade, locked 01-09-2026): the outgoing
// page exits as one block, rows re-enter one by one, and each row's bar grows
// after the row lands. Everything on the house ease-apple curve; disabled
// wholesale under prefers-reduced-motion.
// ---------------------------------------------------------------------------

export const APPLE_EASE = [0.32, 0.72, 0, 1] as const

/** Keyed page container — change `flipKey` (page or tab) to run the flip. */
export function CascadeGroup({
  flipKey,
  className,
  children,
}: {
  flipKey: string
  className?: string
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  if (reduced) {
    return <div className={className}>{children}</div>
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={flipKey}
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.1 } }}
        exit={{ opacity: 0, y: 4, transition: { duration: 0.11, ease: 'easeIn' } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/** One row's entrance: 8px rise, 26ms stagger by index. */
export function CascadeRow({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion()
  if (reduced) {
    return <>{children}</>
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: APPLE_EASE, delay: index * 0.026 }}
    >
      {children}
    </motion.div>
  )
}

/**
 * The row's proportional bar: a full-height tint behind the row content that
 * grows to its share after the row lands, and deepens on row hover. Width is
 * 0–75 (the house cap: the longest bar never touches the stat cluster) and
 * must be computed against the FULL list so bars stay comparable across pages.
 * `color` overrides the tint (engagement score bars); inline colors also skip
 * the hover deepen, which is correct there.
 *
 * `className` (PULSE-197): appended to the default classes, for the one case
 * where RowBar is no longer a DESCENDANT of its row's own click target — a
 * row built from a separate overlay `<button>` sibling needs RowBar marked
 * `pointer-events-none`, or it silently swallows clicks landing on the bar's
 * width (it has no click handler of its own, so today it only "works"
 * because it sits inside the clickable element and the click bubbles up).
 */
export function RowBar({ width, index = 0, color, className }: { width: number; index?: number; color?: string; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      aria-hidden="true"
      className={cn('absolute inset-y-0.5 left-0.5 rounded-none bg-brand-orange/[0.16] md:group-hover:bg-brand-orange/[0.26] transition-colors duration-fast ease-apple', className)}
      style={color ? { backgroundColor: color } : undefined}
      initial={reduced ? false : { width: 0 }}
      animate={{ width: `${width}%` }}
      transition={reduced ? { duration: 0 } : { duration: 0.36, ease: APPLE_EASE, delay: 0.11 + index * 0.026 }}
    />
  )
}
