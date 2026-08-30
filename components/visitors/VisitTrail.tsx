'use client'

import { useEffect, useMemo, useState } from 'react'
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

  // 🔴 PAGES ACCUMULATE. Rendering `data.events` alone meant the second page
  // REPLACED the first: a 242-step visit, opened and "Load more"d, showed steps
  // 201–242 with its beginning gone — the precise failure the comment below
  // says must never ship, arriving from the other end.
  //
  // Kept as a page MAP rather than the `[...prev, ...next]` append the audit-log
  // card uses, because that card fetches directly and this one is on SWR:
  // revalidation re-delivers a page already held, and an append would duplicate
  // every step of it. Writing under the page's own key is idempotent.
  //
  // 🔑 Keyed by `data.page` — the page the SERVER says it answered — never by
  // the local `page` state. The hook sets `keepPreviousData: true`, so straight
  // after a click `data` still holds the PREVIOUS page while `page` already
  // reads the new one; keying on local state would file page 1's steps under 2.
  const [pages, setPages] = useState<Record<number, VisitEvent[]>>({})

  // The subject changing (a different visit, or a new range) invalidates
  // everything accumulated for the old one.
  const subject = `${siteId}|${visitorKey}|${visitKey}|${range.startDate ?? ''}|${range.endDate ?? ''}|${range.minutes ?? ''}`
  useEffect(() => {
    setPage(1)
    setPages({})
  }, [subject])

  useEffect(() => {
    if (!data?.events) return
    const n = data.page
    // 🔴 RECORD EACH PAGE ONCE, decided on the page NUMBER — never on the
    // identity of `data.events`. A fetcher handing back a fresh array for the
    // same page (any re-render can) makes an identity comparison false forever:
    // setPages writes on every render, the write re-renders, and the component
    // spins. Returning `prev` unchanged lets React bail out of the update.
    setPages((prev) => (prev[n] !== undefined ? prev : { ...prev, [n]: data.events }))
  }, [data])

  const events = useMemo(
    () =>
      Object.keys(pages)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((n) => pages[n]),
    [pages],
  )
  const total = data?.total ?? 0
  // True by construction now, which also repairs TrailStep's `last` prop — it
  // used to end the rail at the end of every PAGE rather than of the trail.
  const shownThrough = events.length

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
          {/* An em dash, never a "/": a site that collects no page paths must
              not be shown a page its visitor may never have been on. */}
          <span className="min-w-0 truncate text-sm text-neutral-300">{event.path ?? EM_DASH}</span>
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
