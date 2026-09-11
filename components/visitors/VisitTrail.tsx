'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CursorClick,
  Copy,
  PaperPlaneTilt,
  ArrowSquareOut,
  DownloadSimple,
  Tag,
  FileText,
  type Icon,
} from '@phosphor-icons/react'
import { useVisitEvents } from '@/lib/swr/dashboard'
import { EM_DASH, formatDuration } from '@/lib/visitors/format'
import {
  TRAIL_KINDS,
  autoSentence,
  chipProps,
  countByKind,
  groupTrail,
  kindOf,
  type TrailGroup,
  type TrailKind,
} from '@/lib/visitors/trail'
import type { VisitEvent } from '@/lib/api/visitors'

// ─── The rail timeline (approved §9a detail 3; reorganised in round 6) ──────
//
// One expanded visit, page by page. A 7px node on a 1px rail, the path on the
// left, the dwell on the right — and the events that fired while that page was
// open hanging beneath it.
//
// 🔴 ROUND 6 (owner, 10-09-2026): events GROUP UNDER THEIR PAGE, and the card
// carries per-type filter chips. Before this the trail rendered one row per
// EVENT, so a visit with 8 pageviews and 9 events was 17 rows with the path
// restated on every one and nine em dashes in the dwell column — which read as
// pages being printed twice. Nothing was ever duplicated; the rows were events.
//
// The reorganisation is not cosmetic: interaction auto-capture is decided
// (docs/plans/10-09-2026-interaction-autocapture-design.md), and at the measured
// ratio a 10-page visit becomes a 28-row trail. Grouping and the type chips are
// what keep it readable — which is exactly why the reference product has them.
//
// Fetched per EXPANDED row (the SearchExpansion per-row-SWR pattern), so a
// collapsed visit costs nothing and a page of twenty visits is one request, not
// twenty-one.

const PAGE_SIZE = 200

/** Chip labels. Plain English — these are not machine keys, so they are not mono. */
const KIND_LABEL: Record<TrailKind, string> = {
  pageview: 'Pages',
  click: 'Clicks',
  copy: 'Copies',
  form: 'Forms',
  outbound: 'Outbound',
  download: 'Downloads',
  event: 'Events',
}

/**
 * One glyph per kind (round 7, options B + E — owner, 11-09-2026).
 *
 * 🔴 PHOSPHOR, WHICH IS THE HOUSE GLYPH SOURCE. `lib/utils/icons.tsx` already
 * imports `CursorClick` from it. There is no second icon registry here and there
 * must not be — the Visitors surface shipped one by accident in round 4 and the
 * owner caught it in one look.
 *
 * `pageview` has no glyph in the trail: a page row is the SPINE, marked by the
 * rail's node, and a glyph on it would compete with the path it carries. It does
 * get one in the chip row, where there is no node to stand in for it.
 *
 * ⚠️ The `event` bucket is the CUSTOMER's own event — a tag, not one of ours.
 */
const KIND_GLYPH: Record<Exclude<TrailKind, 'pageview'>, Icon> = {
  click: CursorClick,
  copy: Copy,
  form: PaperPlaneTilt,
  outbound: ArrowSquareOut,
  download: DownloadSimple,
  event: Tag,
}

/** The chip row labels every bucket, so `pageview` needs a glyph there. */
const CHIP_GLYPH: Record<TrailKind, Icon> = { ...KIND_GLYPH, pageview: FileText }

/**
 * The mark that precedes a step's sentence.
 *
 * 🔴 IT IS THE BRAND, AND ONE INK (option B1, owner 11-09-2026 — "i think we
 * should implement our brand color more into it. or more orange"). Five
 * treatments were mocked on the real 37-step visit and B1 chosen: every glyph at
 * full `brand-orange`, which is the same orange the trail's own event dots and
 * the filter chips already use. The rejected alternative that coloured each type
 * differently reads as confetti and breaks the house rule that colour lives in a
 * small dot or a single word.
 *
 * `aria-hidden`, because the sentence beside it already says which type it is —
 * the glyph is a decorative duplicate of adjacent text, like every mark in
 * VisitorIcons.
 */
function StepGlyph({ kind }: { kind: TrailKind }) {
  if (kind === 'pageview') return null
  const Glyph = KIND_GLYPH[kind]
  return (
    <Glyph size={14} aria-hidden="true" className="shrink-0 text-brand-orange" />
  )
}

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

  // Which kinds are shown. All four, until somebody says otherwise.
  const [active, setActive] = useState<Set<TrailKind>>(() => new Set(TRAIL_KINDS))

  // The subject changing (a different visit, or a new range) invalidates
  // everything accumulated for the old one — and resets the filter, because a
  // chip left switched off would silently hide steps of the NEXT visit.
  const subject = `${siteId}|${visitorKey}|${visitKey}|${range.startDate ?? ''}|${range.endDate ?? ''}|${range.minutes ?? ''}`
  useEffect(() => {
    setPage(1)
    setPages({})
    setActive(new Set(TRAIL_KINDS))
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
  const counts = useMemo(() => countByKind(events), [events])
  const groups = useMemo(() => groupTrail(events, active), [events, active])
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
      <div className="px-4 pb-4 pl-12" role="status">
        {/* A pulsing grey rectangle says "wait" to a sighted reader and nothing at
            all to anyone else — the row simply expands into silence. */}
        <span className="sr-only">Loading this visit&rsquo;s steps…</span>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} aria-hidden="true" className="mb-2 h-6 animate-pulse rounded-none bg-neutral-800/50" />
        ))}
      </div>
    )
  }

  const shown = TRAIL_KINDS.filter((k) => counts[k] > 0)

  return (
    <div className="pb-3 pl-12 pr-4">
      {/* ─── Type filter ───────────────────────────────────────────────
          Counts are over every LOADED step and never change as you filter — a
          chip whose own count dropped to zero when you clicked it could not be
          clicked back. A kind with no steps in this visit is not rendered at
          all rather than shown greyed: an absent kind is not a control. */}
      {shown.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 pb-1">
          {shown.map((k) => {
            const on = active.has(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setActive((prev) => {
                    const next = new Set(prev)
                    // 🔴 Never let the LAST VISIBLE chip be switched off — an
                    // empty trail looks identical to a visit that recorded
                    // nothing.
                    //
                    // ⚠️ COUNTED OVER THE KINDS THIS VISIT HAS, not over the
                    // set. Round 7 took TRAIL_KINDS from four to seven, and the
                    // set-size guard this replaces then let every visible chip
                    // be switched off: three kinds with no steps and no chip
                    // kept `next.size` above one. Round 6's own test caught it.
                    const stillOn = shown.filter((kind) => next.has(kind)).length
                    if (next.has(k) && stillOn > 1) next.delete(k)
                    else next.add(k)
                    return next
                  })
                }
                className={
                  'flex items-center gap-1.5 border px-2 py-0.5 text-xs transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ' +
                  (on
                    ? 'border-neutral-700 text-neutral-300'
                    : 'border-border text-neutral-600 hover:text-neutral-400')
                }
              >
                {/* Option E (owner, 11-09-2026): the bucket's own glyph, in place
                    of the dot it had. The glyph vocabulary carries from the trail
                    into the bar, so the same mark means the same thing in both —
                    which is the whole reason E was chosen over keeping the dot.
                    A switched-off chip greys its glyph along with its text. */}
                {(() => {
                  const Glyph = CHIP_GLYPH[k]
                  return (
                    <Glyph
                      size={12}
                      aria-hidden="true"
                      className={
                        'shrink-0 ' +
                        (!on ? 'text-neutral-700' : k === 'pageview' ? 'text-neutral-500' : 'text-brand-orange')
                      }
                    />
                  )
                })()}
                {KIND_LABEL[k]}
                <span className="tabular-nums text-neutral-500">{counts[k]}</span>
              </button>
            )
          })}
        </div>
      )}

      {groups.map((g, i) => (
        <TrailRow key={`${g.timestamp}-${i}`} group={g} last={i === groups.length - 1} />
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

function TrailRow({ group, last }: { group: TrailGroup; last: boolean }) {
  const isPage = group.page !== null
  const orphanKind = !isPage && group.events.length > 0 ? kindOf(group.events[0]) : null

  return (
    <div className="relative flex gap-3 pl-4">
      {/* 🔴 THE RAIL IS CENTRED ON THE NODE, which it was not.
          It used to be `left-[7px]` while the node is a flex child sitting after
          this row's `pl-4`, so the line ran 12px to the LEFT of the dots it
          connects — measured on production: rail centre 314.5px, dot centre
          326.5px. The arithmetic, stated once so it cannot drift again:
          pl-4 (16px) + half of the 7px node = 19.5px. */}
      {!last && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[19.5px] top-4 w-px -translate-x-1/2 bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className={
          'relative z-10 mt-2 size-[7px] shrink-0 rounded-full ' +
          (isPage ? 'bg-neutral-500' : 'bg-brand-orange')
        }
      />

      <div className="min-w-0 flex-1 pb-1.5">
        <div className="flex items-baseline justify-between gap-3">
          {/* An em dash, never a "/": a site that collects no page paths must
              not be shown a page its visitor may never have been on. */}
          <span className="min-w-0 truncate text-sm text-neutral-300">
            {isPage ? (
              (group.path ?? EM_DASH)
            ) : (
              // An orphan: an event whose page is filtered away, or whose own
              // path disagrees with the page that was open. It describes itself —
              // and carries the same glyph a nested step would, so a filtered
              // trail does not silently change what a step looks like.
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {orphanKind !== null && <StepGlyph kind={orphanKind} />}
                <EventLabel event={group.events[0]} kind={orphanKind} />
              </span>
            )}
          </span>
          {isPage && (
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
              {/* Dwell is the STORED event duration, never recomputed from the gap
                  to the next step. A missing beacon is an em dash, not a zero. */}
              {group.dwell == null ? EM_DASH : formatDuration(group.dwell)}
            </span>
          )}
        </div>

        {isPage && group.events.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {group.events.map((e, j) => {
              const kind = kindOf(e)
              return (
                <div key={`${e.timestamp}-${j}`} className="flex flex-wrap items-center gap-1.5">
                  <StepGlyph kind={kind} />
                  <EventLabel event={e} kind={kind} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * One event, described.
 *
 * An event Pulse captured itself gets a sentence — "Left for stripe.com/pricing"
 * — because the tracker guarantees its property shape. A customer's own event
 * keeps its name chip and every property, unchanged: D6 pinned FULL properties,
 * truncated for LAYOUT only, with the whole value in the title.
 */
function EventLabel({ event, kind }: { event: VisitEvent; kind: TrailKind | null }) {
  const sentence = autoSentence(event)
  const props = chipProps(event)

  return (
    <>
      {sentence !== null ? (
        // 🔑 A sentence is prose, so it is NOT monospace, even though the thing
        // it names is a URL. The name chip below is a machine key and is.
        <span className="truncate text-sm text-neutral-400">{sentence}</span>
      ) : (
        <span className="bg-brand-orange/10 px-1.5 py-0.5 font-mono text-xs text-brand-orange">
          {event.event_name}
        </span>
      )}
      {props.map(([k, v]) => (
        <span
          key={k}
          title={`${k}: ${v}`}
          className="max-w-[22rem] truncate bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-neutral-300"
        >
          {k}: {v}
        </span>
      ))}
      {kind !== null && kind !== 'pageview' && sentence === null && event.path === null && (
        <span className="sr-only">on an unrecorded page</span>
      )}
    </>
  )
}
