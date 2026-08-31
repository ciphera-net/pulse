'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Receipt } from '@/lib/notifications/types'
import { renderNotification } from '@/lib/notifications/renderers'
import { useResolveSiteName, useResolveUserName } from '@/lib/notifications/resolvers'
import { getTypeIcon } from '@/lib/utils/notifications'
import { markRead } from '@/lib/api/notifications-v2'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'

/**
 * One D4 register row (round-3 Direction B; anatomy A4/B4 of the design
 * record, copy per the 31-08 copy round, variant A everywhere).
 *
 * - Unread rows carry the WASH STUB (orange left edge); read rows drop it and
 *   the title recedes to text-neutral-300.
 * - The meta line speaks honest verbs: "Emailed HH:MM" means HANDED OFF
 *   (delivered_at's formal meaning — null while held); "Delivered" is
 *   reserved for Phase 3's confirmed truth. A held email draws the amber
 *   HELD CHIP; a muted category's row reads "Muted — recorded, not alerted".
 * - Click expands in place AND marks read (ruled): the expansion IS the
 *   content, so reading never consumes unread invisibly. Per-row dismiss and
 *   mark-unread deliberately do not exist here — the register's removal
 *   devices are retention and the purge (the bell keeps its own affordances).
 */
interface RegisterRowProps {
  receipt: Receipt
  categoryName: string
  /** The recipient's quiet_hours_end (HH:MM), for the held chip's send time. */
  quietHoursEnd: string | null
  muted: boolean
  onChange: () => void
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function RegisterRow({
  receipt,
  categoryName,
  quietHoursEnd,
  muted,
  onChange,
}: RegisterRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)

  const resolveSiteName = useResolveSiteName()
  const resolveUserName = useResolveUserName()
  const isUnread = !receipt.read_at
  const { title, body, linkLabel } = renderNotification(receipt, {
    resolveSiteName,
    resolveUserName,
  })
  const linkUrl = receipt.event.link_url
  const recovered = receipt.event.type === 'uptime_monitor_recovered'

  const onToggle = async () => {
    if (!expanded && isUnread && !busy) {
      setBusy(true)
      try {
        await markRead(receipt.event_id)
        onChange()
      } catch (err) {
        toast.error(getAuthErrorMessage(err as Error) || 'Failed to mark notification as read')
      } finally {
        setBusy(false)
      }
    }
    setExpanded((e) => !e)
  }

  // The email leg's honest meta. delivered_at = handed off; held draws the
  // chip; suppression is stated, never hidden. ⚠️ ORDER IS LOAD-BEARING
  // (review catch): `muted` is the CURRENT preference — a row whose email WAS
  // handed off keeps saying so forever; the muted line is only the
  // explanation for rows that carry no email fact at all.
  let emailMeta: React.ReactNode = null
  if (receipt.email_status === 'held') {
    emailMeta = (
      <span className="px-1 text-[11px] bg-amber-500/15 text-amber-400 whitespace-nowrap">
        {quietHoursEnd ? `Held — quiet hours · sends ${quietHoursEnd}` : 'Held — quiet hours'}
      </span>
    )
  } else if (receipt.delivered_at) {
    emailMeta = <span>Emailed {hhmm(receipt.delivered_at)}</span>
  } else if (receipt.email_status === 'suppressed') {
    emailMeta = <span>Email suppressed</span>
  } else if (muted) {
    emailMeta = <span>Muted — recorded, not alerted</span>
  }

  return (
    <li className="relative">
      {isUnread && (
        <span
          data-testid="unread-stub"
          className="absolute inset-y-0.5 left-0.5 w-1.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70"
        />
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group relative w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="relative flex items-start gap-3">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {getTypeIcon(receipt.event.type)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`text-sm font-medium truncate flex items-center gap-2 ${
                  isUnread ? 'text-white' : 'text-neutral-300'
                }`}
              >
                {recovered && (
                  <span className="h-1.5 w-1.5 rounded-full bg-pos shrink-0" aria-hidden="true" />
                )}
                {title}
              </span>
              <span className="text-[11px] text-neutral-500 tabular-nums whitespace-nowrap shrink-0">
                {hhmm(receipt.event.created_at)}
              </span>
            </div>
            {body && !expanded && (
              <p className="mt-0.5 text-sm text-neutral-400 line-clamp-2">{body}</p>
            )}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-neutral-500">
              <span>{categoryName}</span>
              {emailMeta && <span aria-hidden="true">·</span>}
              {emailMeta}
            </div>
            {expanded && (
              <div className="mt-2 border-l-2 border-neutral-800 pl-4 text-sm text-neutral-300 leading-relaxed">
                {body || title}
                {linkUrl && (
                  <div className="mt-2">
                    <Link
                      href={linkUrl}
                      className="text-brand-orange hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {linkLabel || 'Open'}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  )
}
