'use client'

/**
 * @file The bell's row anatomy — Direction A "triage list", option A2 "Docket".
 *
 * Owner picked A2 on 30-08-2026 from a mocked options round on production:
 * `Pulse/docs/plans/30-08-2026-bell-room-direction-a-spec.md`. Decided; the
 * alternatives (A1 "Letterpress", category as a word; A3 "Ledger", single-line
 * rows) were rejected, not shelved. Density was the variable and the lowest was
 * chosen deliberately — the bell is not being asked to show more at once.
 */

import Link from 'next/link'
import type { Receipt } from '@/lib/notifications/types'
import { formatTimeAgo, getTypeIcon } from '@/lib/utils/notifications'

export interface RowProps {
  receipt: Receipt
  title: string
  body?: string
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
export function NotificationRow({ receipt, title, body, removing, onActivate, onDismiss }: RowProps) {
  const isUnread = !receipt.read_at
  const iso = new Date(receipt.event.created_at).toISOString()

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
        <div className="flex items-center justify-between gap-2">
          <p
            className={
              removing
                ? 'text-sm text-neutral-600 min-w-0'
                : isUnread
                  ? 'text-sm font-medium text-white min-w-0'
                  : 'text-sm text-neutral-300 min-w-0'
            }
          >
            {title}
          </p>
          {removing ? (
            <span className="text-xs text-neutral-500 shrink-0">Removing…</span>
          ) : (
            <>
              <p className="text-xs text-neutral-500 shrink-0" title={iso}>
                {formatTimeAgo(receipt.event.created_at)}
              </p>
              {/* 🔑 A RESERVED GUTTER, not padding. The time moved onto the
                  title line while the dismiss control kept its absolute
                  position, so they collided — visible twice in the options
                  round's `states.png`. This spacer reuses the same device the
                  read rows' dot column already uses rather than inventing one,
                  and avoids depending on a padding utility the bundle may not
                  carry. */}
              <span className="w-4 shrink-0" aria-hidden="true" />
            </>
          )}
        </div>
        {body && (
          <p className={`text-xs mt-0.5 line-clamp-2 ${removing ? 'text-neutral-600' : 'text-neutral-400'}`}>
            {body}
          </p>
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
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(receipt.event_id) }}
          aria-label={`Delete my copy of "${title}"`}
          title="Delete my copy"
          /* 🔴 `focus:opacity-100` and the coarse-pointer rule are the fix, not
             polish. `opacity-0 group-hover:opacity-100` alone left this control
             focusable-but-INVISIBLE: a keyboard user could Tab onto a destructive
             action with nothing on screen to say so, and a touch user could never
             reveal it at all. */
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity absolute right-2 top-3 text-neutral-500 hover:text-red-400 px-2 py-1 text-xs"
        >
          ×
        </button>
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
