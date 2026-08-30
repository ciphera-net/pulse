'use client'

import { useState } from 'react'
import { useVisitEvents } from '@/lib/swr/dashboard'
import { EM_DASH, formatDuration } from '@/lib/visitors/format'
import type { VisitEvent } from '@/lib/api/visitors'

// ─── The rail timeline (approved §9a, detail 3) ─────────────────────
//
// One expanded visit, step by step: a 7px node on a 1px rail, the path on the
// left, the dwell on the right. A custom event turns its node orange and hangs
// an event-name chip plus one chip per property beneath it.
//
// Fetched per EXPANDED row (the SearchExpansion per-row-SWR pattern), so a
// collapsed visit costs nothing and a page of twenty visits is one request, not
// twenty-one.

const PAGE_SIZE = 200

interface VisitTrailProps {
  siteId: string
  visitorKey: string
  visitKey: string
  range: { startDate?: string; endDate?: string; minutes?: number | null }
}

export function VisitTrail({ siteId, visitorKey, visitKey, range }: VisitTrailProps) {
  const [page, setPage] = useState(1)
  const { data, error, isLoading } = useVisitEvents(siteId, visitorKey, visitKey, range, page)

  const events = data?.events ?? []
  const total = data?.total ?? 0
  const shownThrough = (page - 1) * PAGE_SIZE + events.length

  if (error) {
    return (
      <p className="px-4 pb-4 pl-12 text-sm text-red-400">
        This visit&rsquo;s steps didn&rsquo;t load. Collapse and reopen to try again.
      </p>
    )
  }

  if (isLoading && events.length === 0) {
    return (
      <div className="px-4 pb-4 pl-12">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="mb-2 h-6 animate-pulse rounded-none bg-neutral-800/50" />
        ))}
      </div>
    )
  }

  return (
    <div className="pb-3 pl-12 pr-4">
      {events.map((e, i) => (
        <TrailStep key={`${e.timestamp}-${i}`} event={e} last={i === events.length - 1} />
      ))}

      {/* 🔴 A trail longer than one page shows this, never a silently truncated
          list. A complete-looking trail that is missing its tail is the one
          thing this surface must not produce — somebody would read it as
          "they left after five pages". */}
      {shownThrough < total && (
        <div className="mt-2 flex items-center gap-3 pl-4">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="border border-border px-3 py-1.5 text-xs text-neutral-300 transition-colors duration-fast ease-apple hover:border-neutral-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            Load more
          </button>
          <span className="text-xs tabular-nums text-neutral-600">
            showing {shownThrough} of {total} steps
          </span>
        </div>
      )}
    </div>
  )
}

function TrailStep({ event, last }: { event: VisitEvent; last: boolean }) {
  const isCustom = event.type === 'custom'
  const props = Object.entries(event.properties ?? {})

  return (
    <div className="relative flex gap-3 pl-4">
      {/* The rail: a 1px line behind the nodes, stopped at the last step so it
          does not trail off into nothing. */}
      {!last && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[7px] top-4 w-px bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className={
          'relative z-10 mt-2 size-[7px] shrink-0 rounded-full ' +
          (isCustom ? 'bg-brand-orange' : 'bg-neutral-500')
        }
      />

      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm text-neutral-300">{event.path}</span>
          <span className="shrink-0 text-xs tabular-nums text-neutral-500">
            {/* Dwell is the STORED event duration, never recomputed from the gap
                to the next step. A missing beacon is an em dash, not a zero. */}
            {event.duration == null ? EM_DASH : formatDuration(event.duration)}
          </span>
        </div>

        {isCustom && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="bg-brand-orange/10 px-1.5 py-0.5 font-mono text-xs text-brand-orange">
              {event.event_name}
            </span>
            {/* D6: FULL properties. Values are truncated for LAYOUT only, with
                the whole value in the title — a 253-character URL (the longest
                measured in production) cannot sit in a chip, but nothing is
                withheld. */}
            {props.map(([k, v]) => (
              <span
                key={k}
                title={`${k}: ${v}`}
                className="max-w-[22rem] truncate bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-neutral-300"
              >
                {k}: {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
