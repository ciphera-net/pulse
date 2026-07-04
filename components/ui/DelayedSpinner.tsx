'use client'

import { useEffect, useState } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const SHOW_DELAY_MS = 150

/**
 * A spinner that only appears after 150 ms so fast fetches never flash it.
 * Mount it inside a stable-height box while `isLoading && !data`; unmounting
 * on settle clears the timer before it fires.
 */
export function DelayedSpinner({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <CircleNotch
      role="status"
      aria-label="Loading"
      className={cn('h-4 w-4 animate-spin text-neutral-500', className)}
    />
  )
}
