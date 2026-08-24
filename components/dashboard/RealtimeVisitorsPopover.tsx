'use client'

import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@ciphera-net/facet'
import { useRealtimePages } from '@/lib/swr/dashboard'
import { cn } from '@/lib/utils'

interface RealtimeVisitorsPopoverProps {
  siteId: string
  /** Live visitor count (owned by the page's realtime hook). */
  count: number
  /** Optional: clicking an active page applies it as a dashboard filter. */
  onFilterPage?: (path: string) => void
}

/**
 * The toolbar's live-visitors control: a bordered chip (same control recipe as
 * the Filter button and date picker beside it) opening a popover of the pages
 * visitors are on right now.
 *
 * Behavior contract — the old inline version had none of this: closes on
 * outside click, Escape (focus returns to the chip), and site change; opens
 * even at zero visitors (honest empty state instead of a dead click); fetches
 * the per-page breakdown ONLY while open (15s live refresh via SWR); rows are
 * actionable — clicking one filters the dashboard to that page.
 */
export default function RealtimeVisitorsPopover({ siteId, count, onFilterPage }: RealtimeVisitorsPopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Fetch only while the popover is open — a null SWR key otherwise.
  const { data: pages, isLoading } = useRealtimePages(open ? siteId : '')

  // Close when switching sites — stale pages from the previous site must
  // never flash under the new site's toolbar.
  useEffect(() => {
    setOpen(false)
  }, [siteId])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const live = count > 0
  const shown = (pages ?? []).slice(0, 10)
  const maxVisitors = shown.reduce((m, p) => Math.max(m, p.visitors), 0)

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-tour="realtime-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 items-center gap-2 rounded-none border border-input bg-card px-3 text-sm text-foreground transition-colors ease-apple hover:border-line-hover',
          open && 'border-line-hover',
        )}
      >
        <span className="relative flex h-2 w-2">
          {live && (
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-green-500 opacity-75" />
          )}
          <span
            className={cn(
              'relative inline-flex h-2 w-2 rounded-full',
              live ? 'bg-green-500' : 'bg-neutral-600',
            )}
          />
        </span>
        {/* whitespace-nowrap: the chip is a fixed h-10 box, so when the label was
            allowed to wrap on a narrow toolbar the three lines overflowed the
            button's own border box and the count rendered ABOVE the chip. */}
        <span className="whitespace-nowrap tabular-nums">
          {count} current {count === 1 ? 'visitor' : 'visitors'}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Current visitors by page"
          className="absolute left-0 top-full z-50 mt-2 w-80 rounded-none border border-border bg-popover shadow-lg"
        >
          <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-foreground">Active pages</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {count} live · refreshes every 15s
            </span>
          </div>

          {isLoading && !pages ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Spinner />
            </div>
          ) : shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No one is browsing right now.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto p-2">
              {shown.map((p) => {
                const barWidth = maxVisitors > 0 ? (p.visitors / maxVisitors) * 75 : 0
                const Row = onFilterPage ? 'button' : 'div'
                return (
                  <Row
                    key={p.path}
                    {...(onFilterPage
                      ? {
                          type: 'button' as const,
                          onClick: () => {
                            onFilterPage(p.path)
                            setOpen(false)
                          },
                          title: `Filter dashboard to ${p.path}`,
                        }
                      : {})}
                    className={cn(
                      'relative flex h-9 w-full items-center justify-between overflow-hidden rounded-none px-2 text-left',
                      onFilterPage && 'interactive-row cursor-pointer',
                    )}
                  >
                    {/* Same proportional-bar device as the dashboard's Top Pages rows */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0.5 left-0.5 rounded-none border-l-2 border-brand-orange/70 bg-brand-orange/[0.07] transition-[width] ease-apple"
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="relative min-w-0 flex-1 truncate text-sm text-foreground">
                      {p.path}
                    </span>
                    <span className="relative ml-3 shrink-0 text-sm tabular-nums text-muted-foreground">
                      {p.visitors}
                    </span>
                  </Row>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
