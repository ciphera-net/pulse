'use client'

import { useCallback, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// ---------------------------------------------------------------------------
// One shared query-string writer for pages where several components own
// different URL params (?period=/?g=/?m=/?view=/?p=/?expand=/?s= on the
// Search page). Each component building its own URLSearchParams from its own
// useSearchParams() snapshot loses the other's write when two interactions
// land inside one router commit — the second replace() is built from a stale
// snapshot. The writer keeps the last written query string in module state
// and bases the next write on it while the commit is still in flight.
//
// The pending state is short-lived by design (freshness window): after a
// back/forward navigation the committed params may legitimately never catch
// up with a stale pending value, and basing writes on it would resurrect
// dropped params. Two seconds comfortably covers a router commit; it does
// not try to survive anything longer.
// ---------------------------------------------------------------------------

const PENDING_FRESH_MS = 2000

let pending: { pathname: string; qs: string; at: number } | null = null

export function useQueryParamsWriter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Drop the pending state once the router has committed it.
  useEffect(() => {
    if (pending && pending.pathname === pathname && searchParams.toString() === pending.qs) {
      pending = null
    }
  }, [searchParams, pathname])

  return useCallback(
    (updates: Record<string, string | null>) => {
      const usePending =
        pending && pending.pathname === pathname && Date.now() - pending.at < PENDING_FRESH_MS
      const base = usePending ? pending!.qs : searchParams.toString()
      const next = new URLSearchParams(base)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      pending = { pathname, qs, at: Date.now() }
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )
}
