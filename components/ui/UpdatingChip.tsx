'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CircleNotch } from '@phosphor-icons/react'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface UpdatingChipProps {
  /** True while a refetch is in flight. The chip waits 150 ms before showing. */
  active: boolean
  className?: string
}

const SHOW_DELAY_MS = 150

/**
 * Quiet "Updating…" indicator for canvases that keep stale data mounted
 * while revalidating. Delayed so fast fetches never flash it; resets
 * before paint whenever the fetch settles.
 */
export function UpdatingChip({ active, className }: UpdatingChipProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [active])

  if (!visible) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
      className={cn(
        'pointer-events-none absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-none border border-neutral-800 bg-card px-2.5 py-1.5',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <CircleNotch className="h-3.5 w-3.5 animate-spin text-neutral-400" />
      <span className="text-xs text-neutral-400">Updating…</span>
    </motion.div>
  )
}
