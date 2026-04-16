'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * Prevents skeleton flicker on fast loads by keeping it visible
 * for at least `minMs` once it appears.
 *
 * @param loading - The raw loading state from data fetching
 * @param minMs - Minimum milliseconds the skeleton stays visible (default 300)
 * @returns Whether the skeleton should be shown
 */
export function useMinimumLoading(loading: boolean, minMs = 300): boolean {
  const [show, setShow] = useState(loading)
  const startRef = useRef<number>(loading ? Date.now() : 0)

  useEffect(() => {
    if (loading) {
      startRef.current = Date.now()
      setShow(true)
    } else {
      const elapsed = Date.now() - startRef.current
      const remaining = minMs - elapsed
      if (remaining > 0) {
        const timer = setTimeout(() => setShow(false), remaining)
        return () => clearTimeout(timer)
      } else {
        setShow(false)
      }
    }
  }, [loading, minMs])

  return show
}

/**
 * Returns 'animate-fade-in' when transitioning from skeleton to content,
 * empty string otherwise. Prevents the jarring visual "pop" when skeletons
 * are replaced by real content, without adding unnecessary animation when
 * data loads from cache (no skeleton shown).
 */
export function useSkeletonFade(showSkeleton: boolean): string {
  const wasEverLoading = useRef(false)

  if (showSkeleton) {
    wasEverLoading.current = true
  }

  return !showSkeleton && wasEverLoading.current ? 'animate-skeleton-fade' : ''
}
