'use client'

/**
 * @file What's new: a top-bar button and its panel, for every team (it left its beta on 09-11-2026). The panel says when a new version of Pulse is
 * ready (taking over from VersionToast, see lib/updateNotice.ts) and lists the changelog's latest Pulse posts, the
 * week's main change first as a card led by its docs screenshot. Design: "a strip of orange", picked in the options
 * rounds of 08-11-2026.
 *
 * Mounted twice like the getting-started chip: GlassTopBar (hidden below md) and ContentHeader (md:hidden). The data
 * lives in useWhatsNew()'s shared SWR cache and the update state in lib/updateNotice.ts, so the two cannot disagree;
 * the panel portals to document.body with fixed positioning to escape overflow.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { XIcon } from '@ciphera-net/facet'
import { ArrowClockwise, ArrowUpRight, Sparkle } from '@phosphor-icons/react'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { cdnUrl } from '@/lib/cdn'
import { useWhatsNew } from '@/lib/hooks/useWhatsNew'
import { useClaimUpdateNotice, useUpdateReady } from '@/lib/updateNotice'
import type { WhatsNewEntry, WhatsNewKind, WhatsNewPost, WhatsNewResponse } from '@/lib/api/whatsNew'

/** The panel's width on a computer; on a phone it is the screen width less 8 px on each side. */
const PANEL_MAX_WIDTH = 400
/** Rows under the card: four keep the panel short, and the changelog link leads to the rest. */
const ROW_LIMIT = 4

const KIND_LABEL: Record<Exclude<WhatsNewKind, ''>, string> = {
  new: 'New',
  beta: 'Beta',
  everyone: 'For everyone',
  improved: 'Improved',
  changed: 'Changed',
  fixed: 'Fixed',
  removed: 'Removed',
  deprecated: 'Deprecated',
  security: 'Security',
}
/** Kinds that name something a team can now use: drawn in orange, the rest in grey. */
const ORANGE_KINDS: ReadonlySet<WhatsNewKind> = new Set(['new', 'beta', 'everyone'])

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "2026-11-02" → "2 Nov". A post's date is a calendar day, so it is read and printed in UTC. */
export function shortPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : SHORT_DATE.format(d)
}

function Dot({ on }: { on: boolean }) {
  return <span className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-brand-orange' : 'bg-neutral-600'}`} />
}

function Meta({ kind, date }: { kind: WhatsNewKind; date: string }) {
  return (
    <>
      {kind !== '' && (
        <span className={`text-[11px] font-medium ${ORANGE_KINDS.has(kind) ? 'text-brand-ink' : 'text-neutral-400'}`}>
          {KIND_LABEL[kind]}
        </span>
      )}
      <span className="text-[11px] text-neutral-600 tabular-nums">{shortPostDate(date)}</span>
    </>
  )
}

interface Row {
  key: string
  post: WhatsNewPost
  entry: WhatsNewEntry
}

/**
 * The newest post leads as the card (its lead, or its first change when it has none); every other entry becomes a
 * row, newest post first, at most ROW_LIMIT.
 */
export function arrange(posts: readonly WhatsNewPost[]): { lead: Row | null; rows: Row[] } {
  const [first, ...rest] = posts
  if (!first) return { lead: null, rows: [] }
  const firstEntries = first.lead ? [first.lead, ...first.changes] : first.changes
  const [leadEntry, ...firstRest] = firstEntries
  const rows: Row[] = [
    ...firstRest.map((entry, i) => ({ key: `${first.slug}:${i + 1}`, post: first, entry })),
    ...rest.flatMap((post) =>
      (post.lead ? [post.lead, ...post.changes] : post.changes).map((entry, i) => ({ key: `${post.slug}:${i}`, post, entry })),
    ),
  ].slice(0, ROW_LIMIT)
  return { lead: leadEntry ? { key: `${first.slug}:0`, post: first, entry: leadEntry } : null, rows }
}

function LeadCard({ row }: { row: Row }) {
  const { post, entry } = row
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group mx-3 mb-2 block border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700"
    >
      {entry.image && (
        // The docs screenshot at the card's width, inset over a 64 px strip of orange and the card's grey, so the card
        // shows the whole picture as the docs post does (a fixed 696 px zoomed a section capture in and cut it off,
        // 09-11-2026). Its hairline and shadow are theme tokens (styles/globals.css, --whats-new-shot-*).
        <span className="relative block h-[210px] overflow-hidden border-b border-neutral-800">
          <span className="absolute inset-x-0 top-0 h-16 bg-brand-orange" />
          {/* eslint-disable-next-line @next/next/no-img-element -- a docs screenshot from the CDN, drawn at the card's width */}
          <img src={entry.image} alt="" loading="lazy" className="whats-new-shot absolute left-[26px] top-[26px] w-[calc(100%-26px)] max-w-none" />
        </span>
      )}
      <span className="block px-3.5 pt-3 pb-3">
        <span className="flex items-center gap-2">
          <Dot on={post.unread} />
          <Meta kind={entry.type} date={post.date} />
        </span>
        <span className="mt-1.5 block text-sm font-medium text-white">{entry.text}</span>
        {entry.more && <span className="mt-1 block text-xs text-neutral-500 line-clamp-2">{entry.more}</span>}
      </span>
    </a>
  )
}

function EntryRow({ row }: { row: Row }) {
  const { post, entry } = row
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex items-start gap-3 px-4 py-2 transition-colors hover:bg-white/[0.06]"
    >
      <span className="flex h-4 shrink-0 items-center">
        <Dot on={post.unread} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-xs line-clamp-2 ${post.unread ? 'text-neutral-200' : 'text-neutral-400'}`}>{entry.text}</span>
        <span className="mt-0.5 flex items-center gap-2">
          <Meta kind={entry.type} date={post.date} />
        </span>
      </span>
    </a>
  )
}

function Body({ shown, error, onRetry }: { shown: WhatsNewResponse | undefined; error: unknown; onRetry: () => void }) {
  if (!shown) {
    if (error) {
      return (
        <div className="px-4 pt-1 pb-4">
          <p className="text-xs text-neutral-400">Could not load what&apos;s new.</p>
          <button type="button" onClick={onRetry} className="mt-2 text-xs font-medium text-brand-ink hover:underline">
            Try again
          </button>
        </div>
      )
    }
    return <p className="px-4 pt-1 pb-4 text-xs text-neutral-500">Loading</p>
  }
  const { lead, rows } = arrange(shown.posts)
  if (!lead) return <p className="px-4 pt-1 pb-4 text-xs text-neutral-500">The changelog has no Pulse posts yet.</p>
  return (
    <>
      <LeadCard row={lead} />
      {rows.length > 0 && (
        <div className="pb-2">
          {rows.map((row) => (
            <EntryRow key={row.key} row={row} />
          ))}
        </div>
      )}
    </>
  )
}

export default function WhatsNewButton() {
  useClaimUpdateNotice(true)
  const updateReady = useUpdateReady()
  const { data, error, reload, markSeen } = useWhatsNew()
  const [open, setOpen] = useState(false)
  // What the open panel shows: the answer as it was when the panel opened, so the dots stay while it is read even
  // though opening it records everything as seen.
  const [snapshot, setSnapshot] = useState<WhatsNewResponse | null>(null)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number; width: number } | null>(null)

  // The getting-started panel's own rule: right-aligned to the button, never closer than 8 px to a screen edge.
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 16)
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    let top = rect.bottom + 8
    if (panelRef.current) {
      const maxTop = window.innerHeight - panelRef.current.offsetHeight - 8
      top = Math.min(top, Math.max(8, maxTop))
    }
    setFixedPos({ left, top, width })
  }, [])

  useEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition, snapshot, data])

  // Opening records the posts as seen. Opened before the first answer arrived, it records them when the answer lands.
  const pendingSeenRef = useRef(false)
  const openPanel = () => {
    setSnapshot(data ?? null)
    pendingSeenRef.current = !data
    if (data && data.unread_count > 0) void markSeen()
    setOpen(true)
  }
  const closePanel = useCallback(() => {
    setOpen(false)
    setSnapshot(null)
    pendingSeenRef.current = false
  }, [])
  useEffect(() => {
    if (!open || !pendingSeenRef.current || !data) return
    pendingSeenRef.current = false
    if (data.unread_count > 0) void markSeen()
  }, [open, data, markSeen])

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (wrapRef.current && !wrapRef.current.contains(target) && (!panelRef.current || !panelRef.current.contains(target))) {
        closePanel()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, closePanel])


  const shown = snapshot ?? data
  const unreadNow = (data?.unread_count ?? 0) > 0
  const showsUnread = (shown?.unread_count ?? 0) > 0
  const label = updateReady ? 'Update ready' : "What's new"

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="What's new"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="fixed z-[100] origin-top-right overflow-y-auto rounded-none border border-border bg-popover"
          style={{
            maxHeight: 'calc(100vh - 16px)',
            ...(fixedPos ? { left: fixedPos.left, top: fixedPos.top, width: fixedPos.width } : { width: PANEL_MAX_WIDTH }),
          }}
        >
          {updateReady && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-neutral-900 px-4 py-2.5">
              <span className="flex items-center gap-2">
                <Dot on />
                <span className="text-xs font-medium text-white">A new version of Pulse is ready</span>
              </span>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-none bg-brand-orange px-3 py-1.5 text-xs font-medium text-white transition-colors ease-apple hover:bg-brand-orange-button-hover"
              >
                <ArrowClockwise className="h-3.5 w-3.5" weight="bold" />
                Refresh
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
            <span className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- the sidebar's own Pulse mark */}
              <img src={cdnUrl('/pulse_icon_no_margins.png')} alt="" className="h-5 w-5 shrink-0 object-contain" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-white">What&apos;s new</span>
                {!updateReady && showsUnread && <span className="text-xs text-neutral-500">Since your last visit</span>}
              </span>
            </span>
            <button type="button" onClick={closePanel} className="p-0.5 text-neutral-600 hover:text-neutral-400" aria-label="Close">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <Body shown={shown} error={error} onRetry={() => void reload()} />

          <div className="border-t border-border px-4 py-2.5">
            <a
              href={shown?.changelog_url ?? 'https://docs.ciphera.net/changelog/pulse'}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white"
            >
              Read the full changelog
              <ArrowUpRight aria-hidden="true" className="h-3 w-3 transition-colors duration-fast motion-reduce:transition-none group-hover:text-brand-ink" />
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative" ref={wrapRef}>
      {/* The getting-started chip's button classes: h-11 below md for the 44px touch minimum, md:h-auto on desktop. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        className="relative flex h-11 items-center justify-center gap-1.5 rounded-none bg-white/[0.06] px-2 text-neutral-400 transition-colors hover:bg-white/[0.1] hover:text-white md:h-auto md:py-2"
      >
        <span className="relative inline-flex">
          <Sparkle className="h-[18px] w-[18px]" />
          {(updateReady || unreadNow) && (
            <span
              data-testid="whats-new-dot"
              className="whats-new-halo absolute inline-flex h-2 w-2 rounded-full bg-brand-orange"
              style={{ top: -2, right: -3 }}
            />
          )}
        </span>
        <span className="hidden text-xs font-medium text-neutral-200 md:inline">{label}</span>
      </button>

      {typeof document !== 'undefined' ? createPortal(panel, document.body) : panel}
    </div>
  )
}
