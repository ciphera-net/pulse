'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import type { Receipt } from '@/lib/notifications/types'
import { renderNotification } from '@/lib/notifications/renderers'
import { useResolveSiteName, useResolveUserName } from '@/lib/notifications/resolvers'
import { formatTimeAgo } from '@/lib/utils/notifications'
import { markRead, markUnread, dismiss, listDeliveries, type Delivery } from '@/lib/api/notifications-v2'
import Link from 'next/link'

interface NotificationRowProps {
  receipt: Receipt
  onChange: () => void
}

export default function NotificationRow({ receipt, onChange }: NotificationRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)

  useEffect(() => {
    if (expanded && deliveries === null) {
      listDeliveries(receipt.event_id)
        .then(r => setDeliveries(r.deliveries ?? []))
        .catch(() => setDeliveries([]))
    }
  }, [expanded, deliveries, receipt.event_id])

  const resolveSiteName = useResolveSiteName()
  const resolveUserName = useResolveUserName()
  const isUnread = !receipt.read_at
  const { title, body, linkLabel } = renderNotification(receipt, { resolveSiteName, resolveUserName })
  const linkUrl = receipt.event.link_url

  const onToggle = async () => {
    if (!expanded && isUnread && !busy) {
      setBusy(true)
      try {
        await markRead(receipt.event_id)
        onChange()
      } finally {
        setBusy(false)
      }
    }
    setExpanded(e => !e)
  }

  const onDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await dismiss(receipt.event_id)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const onMarkUnread = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await markUnread(receipt.event_id)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`rounded-lg overflow-hidden transition-colors ${
      isUnread ? 'border-l-2 border-brand-orange bg-brand-orange/[0.06]' : 'border-l-2 border-transparent'
    }`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 hover:bg-white/[0.03] cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${isUnread ? 'font-medium text-white' : 'text-neutral-300'}`}>{title}</p>
            <p
              className="text-xs text-neutral-500 mt-1"
              title={new Date(receipt.event.created_at).toISOString()}
            >
              {formatTimeAgo(receipt.event.created_at)}
            </p>
          </div>
          <span className="text-neutral-500 text-sm shrink-0 mt-0.5">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm text-neutral-300 space-y-3">
              {body && <p>{body}</p>}

              {linkUrl && (
                <Link
                  href={linkUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium bg-brand-orange/10 text-brand-orange border border-brand-orange/30 hover:bg-brand-orange/20 transition-colors"
                >
                  {linkLabel ?? 'View details'} →
                </Link>
              )}

              <div className="flex items-center gap-4 text-xs">
                {receipt.read_at && (
                  <button
                    type="button"
                    onClick={onMarkUnread}
                    disabled={busy}
                    className="text-neutral-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Mark unread
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={busy}
                  className="text-neutral-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}
