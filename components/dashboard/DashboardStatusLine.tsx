'use client'

import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// The dashboard's provenance strip (F13, overhaul Phase 2) — the one line every
// sibling instrument page already has and this page lacked: what the numbers
// are computed FROM, in whose timezone the days are bucketed, whether a filter
// narrows the view, and how fresh the payload is. One sentence, stated rather
// than discovered.
// ---------------------------------------------------------------------------

interface DashboardStatusLineProps {
  timezone?: string | null
  lastUpdatedAt: number | null
  filterCount: number
}

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export function DashboardStatusLine({ timezone, lastUpdatedAt, filterCount }: DashboardStatusLineProps) {
  // Ticks so "updated Ns ago" stays honest between refreshes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])

  if (!lastUpdatedAt) return null

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500">
      <span aria-hidden="true" className="relative flex h-2 w-2 items-center justify-center">
        <span className="absolute h-2 w-2 animate-ping rounded-full bg-green-500/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      </span>
      <span>Live from events</span>
      <span aria-hidden="true" className="text-neutral-700">·</span>
      <span title="Sessions convicted as bots are removed retroactively; these numbers already reflect that.">conviction-filtered</span>
      <span aria-hidden="true" className="text-neutral-700">·</span>
      <span>days are {timezone || 'UTC'}</span>
      {filterCount > 0 && (
        <>
          <span aria-hidden="true" className="text-neutral-700">·</span>
          <span className="text-brand-orange">filtered by {filterCount} {filterCount === 1 ? 'condition' : 'conditions'}</span>
        </>
      )}
      <span aria-hidden="true" className="text-neutral-700">·</span>
      <span>updated {ago(lastUpdatedAt, now)}</span>
    </p>
  )
}
