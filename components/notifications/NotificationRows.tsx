'use client'

/**
 * @file The notification row — Direction A "triage list", option A2 "Docket".
 *
 * Owner picked A2 on 30-08-2026 from a mocked options round on production:
 * `Pulse/docs/plans/30-08-2026-bell-room-direction-a-spec.md`. Decided; the
 * alternatives (A1 "Letterpress", category as a word; A3 "Ledger", single-line
 * rows) were rejected, not shelved. Density was the variable and the lowest was
 * chosen deliberately — the bell is not being asked to show more at once.
 *
 * Since 22-09-2026 (PULSE-15, direction "a · One list") the /notifications page
 * renders THIS row too, so the two surfaces cannot drift: the page passes a
 * clock time where the bell passes a relative one, and an optional footer line
 * (the category word). The dismiss control is the house rung for a row-level
 * action — Facet ghost `Button` with `XIcon` — always visible, quiet, 24 px,
 * labelled "Dismiss" (owner pick x1; the previous hover-only text glyph was
 * 22 × 24 px and said "Delete my copy").
 */

import Link from 'next/link'
import { Button, XIcon } from '@ciphera-net/facet'
import type { Receipt } from '@/lib/notifications/types'
import { formatTimeAgo, getTypeIcon } from '@/lib/utils/notifications'

export interface RowProps {
  receipt: Receipt
  title: string
  body?: string
  /**
   * Overrides the read state the row RENDERS. The bell passes the state a
   * receipt had when the panel opened, so that reading-on-open (which marks
   * everything read the moment the panel appears) does not erase the "what is
   * new" signal in the same frame. Omit it and the live `read_at` decides.
   */
  unread?: boolean
  /** The trailing time. Defaults to the relative form ("3h ago"); the page passes a clock. */
  timeLabel?: string
  /** A muted footer line under the body — the page passes the category word. */
  meta?: React.ReactNode
  /** True while a dismiss request is in flight for this row. */
  removing: boolean
  onActivate: (r: Receipt) => void
  onDismiss: (eventID: string) => void
}

/**
 * One notification.
 *
 * 🔴 THE ROW BACKGROUND IS ALWAYS TRANSPARENT. Unread used to be
 * `bg-brand-orange/10` here and `bg-brand-orange/[0.06]` plus a left border on
 * the /notifications page. That breaks the house device, which every sibling
 * follows: colour lives in a small dot or a single word, never in a panel
 * background (`FleetCard` is the canonical example — neutral chip, amber dot,
 * amber word). Unread is now the dot in the chip's corner plus a white,
 * medium-weight title, and the options round's harness asserts every row's
 * computed background is `rgba(0, 0, 0, 0)`.
 */
export function NotificationRow({
  receipt,
  title,
  body,
  unread,
  timeLabel,
  meta,
  removing,
  onActivate,
  onDismiss,
}: RowProps) {
  const isUnread = unread ?? !receipt.read_at
  const iso = new Date(receipt.event.created_at).toISOString()
  const time = timeLabel ?? formatTimeAgo(receipt.event.created_at)

  const inner = (
    <div className="flex gap-3 items-start">
      {/* The category carrier. A2's whole premise: the chip people already
          use stays, and the unread dot docks in its corner rather than
          washing the row. */}
      <span className="w-8 h-8 rounded-none bg-neutral-800/60 flex items-center justify-center shrink-0 mt-0.5 relative">
        {getTypeIcon(receipt.event.type)}
        {isUnread && (
          <span
            className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-brand-orange"
            aria-hidden="true"
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {/* 🔴 THE TITLE TAKES THE FREE SPACE (`flex-1`). This line holds THREE
            children — title, time, gutter — so `justify-between` alone parks
            the time in the MIDDLE of a wide row, following the title's width
            instead of the edge (measured on production the day the page
            became one list: 15:59 mid-row, 19:54 elsewhere). With the title
            greedy, the time and the gutter hug the right and every time in a
            list sits in one column, left of the ×. */}
        <div className="flex items-center justify-between gap-2">
          <p
            className={
              removing
                ? 'text-sm text-neutral-600 min-w-0 flex-1'
                : isUnread
                  ? 'text-sm font-medium text-white min-w-0 flex-1'
                  : 'text-sm text-neutral-300 min-w-0 flex-1'
            }
          >
            {title}
          </p>
          {removing ? (
            <span className="text-xs text-neutral-500 shrink-0">Removing…</span>
          ) : (
            <>
              <p className="text-xs text-neutral-500 shrink-0" title={iso}>
                {time}
              </p>
              {/* 🔑 A RESERVED GUTTER, not padding. The time sits on the title
                  line and the dismiss control is parked over the row's corner,
                  so without this they collide — visible twice in the 30-08
                  round's `states.png`. 24 px wide because the control is. */}
              <span className="w-6 shrink-0" aria-hidden="true" />
            </>
          )}
        </div>
        {body && (
          <p className={`text-xs mt-0.5 line-clamp-2 ${removing ? 'text-neutral-600' : 'text-neutral-400'}`}>
            {body}
          </p>
        )}
        {meta && (
          <div className="mt-1.5 text-[11px] text-neutral-500">{meta}</div>
        )}
      </div>
    </div>
  )

  const activate = () => { if (!removing) onActivate(receipt) }

  return (
    <li className="group relative">
      {receipt.event.link_url ? (
        <Link
          href={receipt.event.link_url}
          onClick={activate}
          aria-disabled={removing || undefined}
          className={`block px-4 py-3 transition-colors ease-apple ${removing ? 'pointer-events-none' : 'hover:bg-white/[0.06]'}`}
        >
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={activate}
          disabled={removing}
          className={`w-full text-left block px-4 py-3 transition-colors ease-apple ${removing ? '' : 'hover:bg-white/[0.06] cursor-pointer'}`}
        >
          {inner}
        </button>
      )}
      {!removing && (
        /* A SIBLING of the row's link, never a child: a button inside an anchor
           is invalid HTML, which is why it is parked absolutely over the corner
           the gutter above reserves. Facet's `Button` has no 24 px icon rung
           (`icon` is 36 px), so the geometry is overridden through `cn`'s
           tailwind-merge; the ghost hover and the focus ring are Facet's own.
           The visible tooltip is the one word; the accessible name carries the
           title AND the time, so ten "Dismiss" buttons are not ten identical
           names even when two rows share a title (two "API key created" in one
           afternoon is the normal case, not the edge). */
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(receipt.event_id) }}
          aria-label={`Dismiss "${title}", ${time}`}
          title="Dismiss"
          className="absolute right-2 top-3 size-6 p-0 text-neutral-500"
        >
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </li>
  )
}

/**
 * A stratum header.
 *
 * Rendered only when BOTH strata have rows — a header on a homogeneous list
 * labels nothing. Sans, never mono: this is chrome, not machine data.
 */
export function StratumHeader({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-4 py-1.5 text-micro-label uppercase tracking-wider text-neutral-500 bg-white/[0.02]">
      {children}
    </li>
  )
}
