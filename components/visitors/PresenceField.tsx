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

/** How much a highlighted dot grows, in px. Approved round 5b (§3 B). */
const HIGHLIGHT_GROWTH = 4

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
  /**
   * How many visitors are in range but NOT in `visitors`.
   *
   * 🔴 IT IS PASSED IN, NOT DERIVED. It used to be `visitors.length - MAX_DOTS`,
   * which is `max(0, ≤100 − 200)` — always zero, so the honesty note was
   * unreachable code. The page knows the range total; the field does not, and
   * cannot, because it is handed a bounded page on purpose.
   */
  undrawn: number
  /**
   * Instants where the identity month rolls over, inside [from, to].
   *
   * The x axis is pure RECENCY and says nothing about identity, so across a
   * month straddle the same person can be two dots with nothing between them.
   * Resolved by the caller in the SITE's timezone — the field never computes a
   * calendar.
   */
  boundaries?: { at: number; label: string }[]
  /**
   * The visitor whose dot is lit, or null.
   *
   * Set by the roster on hover AND on keyboard focus. Hover alone would make the
   * link dead on a phone, which is exactly where the field is most crowded.
   */
  highlightKey?: string | null
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
  undrawn,
  boundaries = [],
  highlightKey = null,
}: PresenceFieldProps) {
  const dots = useMemo(() => {
    const span = Math.max(1, to - from)
    // Most recent first, so the cap keeps the part of the field a reader looks at.
    const ordered = [...visitors].sort(
      (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
    )
    const shown = ordered.slice(0, MAX_DOTS)
    const maxPages = Math.max(1, ...shown.map((v) => v.pageviews))

    // 🔴 NO LABELS. The field is dots and nothing else (owner, round 5b §3).
    //
    // It used to name the active visitors plus the five most recent, which
    // caused three separate problems, all of which this deletes rather than
    // fixes. The label lived INSIDE the dot's positioned box, so it pushed the
    // dot off its own recency x — measured, one dot ended up outside the panel
    // entirely with only a clipped name visible. At 375px five names were
    // clipped by the panel edge at once. And the names went into the reading
    // order with nothing to attach them to.
    //
    // A dot now finds its own name the other way round: hovering or focusing a
    // roster row lights the dot that belongs to it.
    return shown.map((v) => {
      const t = new Date(v.last_seen).getTime()
      // Clamp rather than drop: a visitor whose last_seen sits a hair outside the
      // resolved bounds (the server resolves them in the site's timezone) belongs
      // at the edge, not missing from a field that claims to show everyone.
      const x = Math.min(1, Math.max(0, (t - from) / span))
      const size = 4 + Math.round((Math.min(v.pageviews, maxPages) / maxPages) * 8)
      return {
        key: v.visitor_key,
        name: visitorPseudonym(v.visitor_key),
        x,
        // The lane is hash-derived jitter with no meaning — it exists only to
        // stop dots stacking, and the caption says so. With the labels gone it
        // no longer needs a collision-avoiding ladder for a favoured few.
        y: lane(v.visitor_key),
        size,
        active: v.active_now,
      }
    })
  }, [visitors, from, to])

  // 🔴 The caller's number, not `visitors.length - MAX_DOTS`. That expression
  // was `max(0, ≤100 − 200)` and could never be anything but zero, so the note
  // below has never rendered — which also meant nobody ever saw that it collided
  // with the date axis. It now lives in the caption, where it qualifies the
  // sentence it belongs to.
  const hidden = Math.max(0, undrawn)

  /**
   * The field's text equivalent.
   *
   * 🔴 MEASURED 10-09-2026: the panel rendered its dots as positioned <div>s with
   * no role and no name — nothing for a screen reader but, worse, the LABELLED
   * ones dropped a bare pseudonym into the reading order with no context at all
   * ("Quiet Reader", alone, between two paragraphs).
   *
   * The device is a visually-hidden sentence plus `aria-hidden` on every dot,
   * rather than a name per dot: the field is a redundant visual summary of the
   * roster underneath it, and reading out a hundred names in hash-lane order
   * would be a worse answer than the roster's own sorted, paginated list. The
   * last clause says so, so the sentence is a signpost and not a dead end.
   */
  const summary =
    dots.length === 0
      ? emptyLabel
      : `${visitors.length} ${visitors.length === 1 ? 'visitor' : 'visitors'}, drawn as dots ` +
        'positioned by how recently each was seen — furthest right is most recent. ' +
        `${activeCount} on the site now. ` +
        (hidden > 0 ? `${hidden} more are not drawn. ` : '') +
        'Every visitor drawn here also appears in the roster below, as text.'

  return (
    <div className="relative rounded-none border border-border bg-card" style={{ height: FIELD_HEIGHT }}>
      <p className="sr-only">{summary}</p>
      {/* 🔴 The "+N more" note lives HERE, not at `bottom-2 left-1/2`.
          There it shared a line with the date labels (`inset-x-3 bottom-2
          justify-between`) and landed on top of the middle one. Nobody had seen
          it because the note could never render — the dead code was hiding a
          layout bug as well as a lie. It qualifies the caption, so it sits in it. */}
      <p className="absolute left-3 top-2.5 z-10 text-xs text-neutral-500">
        {caption}
        {hidden > 0 && (
          <>
            {' · '}
            <span className="text-neutral-600">{hidden} more not drawn</span>
          </>
        )}
      </p>
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

      {/* 🔴 Where identities reset (approved round 5, §1 B).
          The x axis is pure recency and says nothing about identity, so across a
          month straddle the same person is two dots with nothing between them —
          measured, 322 of one site's 517 rows in a 30-day range were already-reset
          identities from the previous month. The instants are resolved by the
          caller in the SITE's timezone; this component never computes a calendar. */}
      {boundaries.map((b) => {
        const x = Math.min(1, Math.max(0, (b.at - from) / Math.max(1, to - from)))
        return (
          <div key={b.at} aria-hidden="true">
            <div
              className="absolute top-8 bottom-7 border-l border-dashed border-neutral-700"
              style={{ left: `calc(12px + ${x} * (100% - 36px))` }}
            />
            <span
              className="absolute top-[34px] text-xs text-neutral-600"
              style={{ left: `calc(12px + ${x} * (100% - 36px) + 6px)` }}
            >
              {b.label}
            </span>
          </div>
        )
      })}

      {dots.length === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          {emptyLabel}
        </p>
      ) : (
        dots.map((d) => {
          const lit = highlightKey !== null && d.key === highlightKey
          const size = lit ? d.size + HIGHLIGHT_GROWTH : d.size
          return (
            <div
              key={d.key}
              // A stable hook for tests and the mock harness. The Tailwind classes
              // here (`-translate-y-1/2`) need escaping in a selector and are
              // shared with nothing, but the gridlines and the month hairline are
              // also positioned with `left`, so selecting on that picked them up.
              data-visitor-dot={d.key}
              // Hidden from assistive technology: the sr-only summary above
              // carries the field's meaning, and the roster below carries the
              // names as real text.
              aria-hidden="true"
              className="absolute -translate-y-1/2"
              style={{
                // Inset the plot so a dot at either extreme is not clipped.
                left: `calc(12px + ${d.x} * (100% - 36px))`,
                top: 32 + d.y * (FIELD_HEIGHT - 32 - 28),
                // A lit dot must sit above its neighbours or its glow is cut by
                // whichever dot happens to render after it.
                zIndex: lit ? 5 : undefined,
              }}
            >
              {/*
                🔑 THE LINK BETWEEN THE TWO INSTRUMENTS (approved round 5b, §3 B).
                Hovering or focusing a roster row lights that visitor's dot. It
                replaces the labels: instead of the field naming five arbitrary
                visitors, it answers about the one you are pointing at.

                The dot GROWS by 4px as well as changing colour, because at the
                right-hand edge an orange dot sits among the genuinely-active
                orange ones and colour alone is not enough to find it. Size means
                pageviews here, so the growth is transient emphasis and never a
                stored state — nothing reads a dot's size while it is lit.

                `title` gives a mouse user the name in the other direction too.
              */}
              <span
                title={d.name}
                className={
                  'block shrink-0 rounded-full transition-all duration-fast ease-apple ' +
                  (lit || d.active ? 'bg-brand-orange' : 'bg-neutral-600')
                }
                style={{
                  width: size,
                  height: size,
                  // The glow is the ONE place colour spreads beyond a dot, and it
                  // is a shadow rather than a filled panel — the house rule is
                  // that status lives in a dot or a word, never a background.
                  boxShadow: lit
                    ? '0 0 0 4px rgb(255 92 0 / 0.22)'
                    : d.active
                      ? '0 0 0 3px rgb(255 92 0 / 0.18)'
                      : undefined,
                }}
              />
            </div>
          )
        })
      )}

      <div className="absolute inset-x-3 bottom-2 flex justify-between text-xs text-neutral-600">
        {ticks.map((t) => (
          <span key={t.at} className="tabular-nums">
            {t.label}
          </span>
        ))}
      </div>
    </div>
  )
}
