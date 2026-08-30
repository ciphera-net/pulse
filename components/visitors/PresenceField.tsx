'use client'

import { useMemo } from 'react'
import type { VisitorRow } from '@/lib/api/visitors'
import { visitorPseudonym } from '@/lib/visitors/pseudonym'

// ─── Signature device #1: the presence field (approved §9a.2) ───────
//
// Every visitor in range is a dot. x = recency (the right edge is now, marked by
// a dashed hairline); y = a stable hash-derived lane with NO semantics — it only
// keeps dots from stacking, and the caption says so, because an axis a reader
// can invent a meaning for is worse than no axis.
//
// Diameter is proportional to pages in range, so the field reads as a
// population of individuals rather than a scatter of identical points.
//
// Absolutely-positioned divs, not a canvas: at this cardinality (peak measured
// 4 113 visitor-months on the busiest production site, and the field renders at
// most the 200 most recent) the DOM is cheaper than a canvas's redraw plumbing,
// and the dots inherit hover and focus for free.

const FIELD_HEIGHT = 186
const MAX_DOTS = 200
const LABELLED_INACTIVE = 5

interface PresenceFieldProps {
  visitors: VisitorRow[]
  /** Range bounds as epoch ms — the x-axis domain. */
  from: number
  to: number
  /** Tick labels along the bottom, already formatted. */
  ticks: { at: number; label: string }[]
  activeCount: number
  /** The one-line explainer under the field, which differs in live mode. */
  caption: string
  emptyLabel: string
}

/** A stable 0..1 lane from the key. Deterministic, so a dot does not jump between renders. */
function lane(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

export function PresenceField({
  visitors,
  from,
  to,
  ticks,
  activeCount,
  caption,
  emptyLabel,
}: PresenceFieldProps) {
  const dots = useMemo(() => {
    const span = Math.max(1, to - from)
    // Most recent first, so the cap keeps the part of the field a reader looks at.
    const ordered = [...visitors].sort(
      (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
    )
    const shown = ordered.slice(0, MAX_DOTS)
    const maxPages = Math.max(1, ...shown.map((v) => v.pageviews))

    // Which dots get a name: everyone active, plus the most recent handful.
    // Decided BEFORE placement, because a labelled dot is placed differently.
    let labelledInactive = 0
    const labelled = new Set<string>()
    for (const v of shown) {
      if (v.active_now) {
        labelled.add(v.visitor_key)
      } else if (labelledInactive < LABELLED_INACTIVE) {
        labelled.add(v.visitor_key)
        labelledInactive++
      }
    }

    // 🔴 LABELLED DOTS GET A LADDER, NOT THEIR HASH LANE.
    //
    // The lane is hash-derived jitter with no collision avoidance — which is
    // fine for a bare dot and NOT fine for a dot carrying a name. Two visitors
    // whose hashes land in adjacent lanes at similar recency printed their names
    // on top of each other (measured on staging: "Curious Bookbinder" over
    // "Frequent Bookbinder"). Names are the one thing here a reader actually
    // reads, so the labelled few are spread down an even ladder and everybody
    // else keeps the jitter. The y axis still means nothing, which is what the
    // caption promises.
    const ladderSize = labelled.size
    let ladderIndex = 0

    return shown.map((v) => {
      const t = new Date(v.last_seen).getTime()
      // Clamp rather than drop: a visitor whose last_seen sits a hair outside the
      // resolved bounds (the server resolves them in the site's timezone) belongs
      // at the edge, not missing from a field that claims to show everyone.
      const x = Math.min(1, Math.max(0, (t - from) / span))
      const size = 4 + Math.round((Math.min(v.pageviews, maxPages) / maxPages) * 8)
      const isLabelled = labelled.has(v.visitor_key)
      let y = lane(v.visitor_key)
      if (isLabelled) {
        y = ladderSize > 1 ? (ladderIndex / (ladderSize - 1)) * 0.86 + 0.07 : 0.5
        ladderIndex++
      }
      return {
        key: v.visitor_key,
        x,
        y,
        size,
        active: v.active_now,
        label: isLabelled ? visitorPseudonym(v.visitor_key) : null,
      }
    })
  }, [visitors, from, to])

  const hidden = Math.max(0, visitors.length - MAX_DOTS)

  return (
    <div className="relative rounded-none border border-border bg-card" style={{ height: FIELD_HEIGHT }}>
      <p className="absolute left-3 top-2.5 z-10 text-xs text-neutral-500">{caption}</p>
      {activeCount > 0 && (
        <p className="absolute right-3 top-2.5 z-10 flex items-center gap-1.5 text-xs text-brand-orange">
          <span className="size-1.5 rounded-full bg-brand-orange" aria-hidden="true" />
          {activeCount} on the site now
        </p>
      )}

      {/* Week / time gridlines. aria-hidden — the tick labels below carry the scale. */}
      {ticks.map((t) => {
        const x = Math.min(1, Math.max(0, (t.at - from) / Math.max(1, to - from)))
        return (
          <div
            key={t.at}
            aria-hidden="true"
            className="absolute top-8 bottom-7 w-px bg-border/60"
            style={{ left: `${x * 100}%` }}
          />
        )
      })}

      {/* The now-line: a dashed hairline at the right edge, so "nearer the right,
          more recently seen" has something to be near. */}
      <div
        aria-hidden="true"
        className="absolute right-3 top-8 bottom-7 border-l border-dashed border-neutral-700"
      />

      {dots.length === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          {emptyLabel}
        </p>
      ) : (
        dots.map((d) => (
          <div
            key={d.key}
            className="absolute -translate-y-1/2"
            style={{
              // Inset the plot so a dot at either extreme is not clipped and the
              // labels have somewhere to sit.
              left: `calc(12px + ${d.x} * (100% - 36px))`,
              top: 32 + d.y * (FIELD_HEIGHT - 32 - 28),
            }}
          >
            <div className="flex items-center gap-1.5">
              {d.label && (
                <span
                  className={
                    d.active
                      ? 'order-first whitespace-nowrap text-xs text-neutral-200'
                      : 'order-last whitespace-nowrap text-xs text-neutral-500'
                  }
                >
                  {d.label}
                </span>
              )}
              <span
                className={
                  d.active
                    ? 'block shrink-0 rounded-full bg-brand-orange'
                    : 'block shrink-0 rounded-full bg-neutral-600'
                }
                style={{
                  width: d.size,
                  height: d.size,
                  // The glow is the ONE place colour spreads beyond a dot, and it
                  // is a shadow rather than a filled panel — the house rule is
                  // that status lives in a dot or a word, never a background.
                  boxShadow: d.active ? '0 0 0 3px rgb(255 92 0 / 0.18)' : undefined,
                }}
              />
            </div>
          </div>
        ))
      )}

      <div className="absolute inset-x-3 bottom-2 flex justify-between text-xs text-neutral-600">
        {ticks.map((t) => (
          <span key={t.at} className="tabular-nums">
            {t.label}
          </span>
        ))}
      </div>

      {hidden > 0 && (
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-neutral-600">
          +{hidden} more not drawn
        </p>
      )}
    </div>
  )
}
