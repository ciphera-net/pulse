'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TIMING } from '@/lib/motion'
import { Target } from '@phosphor-icons/react'
import { CompactNumber } from '@/components/ui/compact-number'
import CardEmptyState from '@/components/dashboard/CardEmptyState'
import type { GoalCountStat } from '@/lib/api/stats'
import { getEventPropertyKeys, getEventPropertyValues, type EventPropertyKey, type EventPropertyValue } from '@/lib/api/stats'
import { useSiteRef } from '@/lib/scope/SiteScope'
import { docsUrl } from '@/lib/docs'
import { DIMENSION_ROW } from '@/components/dashboard/MetricRowStat'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CardFooter, useDashboardFrame } from '@/lib/dashboard/frame'

interface GoalStatsProps {
  goalCounts: GoalCountStat[]
  siteId: string
  dateRange: { start: string; end: string }
  // Render only the list, no card chrome/header — for composition inside the
  // Content section's tabbed card (Scroll depth · Events).
  bare?: boolean
  // Off on a customer's share link (02-09-2026): expanding a row fetches the
  // event-properties endpoints, which its public-scoped read is not served, so the
  // rows render plain there — no chevron, no aria-expanded, no fetch to fail. The
  // demo site is served them, so it keeps this on.
  memberFeatures?: boolean
  /** Realtime mode's rolling window in minutes (PULSE-192): the property breakdown uses it instead of the dates. */
  liveMinutes?: number
  /**
   * The page's filters, as the dashboard read was given them. The rows here are already filtered (the server
   * applies them to the list); an opened event's property reads take the same string, so its values add up to
   * the count its row shows. Without it they were the whole site's under any filter (found 15-11-2026: a row
   * read 1,217 and the values under it added up to 2,019).
   */
  filters?: string
}

interface PropertyCache {
  keys: EventPropertyKey[]
  values: Record<string, EventPropertyValue[]> // keyed by property key name
  loading: boolean
}

const LIMIT = 7

/** The cap's fold row (M12-g): stored as `(other)`, shown as a word. */
const OTHER = '(other)'

/** A row's label: "Other" for the fold row, else its display name or the key with underscores as spaces. */
export function goalLabel(row: Pick<GoalCountStat, 'event_name' | 'display_name'>): string {
  if (row.event_name === OTHER) return 'Other'
  return row.display_name ?? row.event_name.replace(/_/g, ' ')
}

export default function GoalStats({ goalCounts, siteId, dateRange, bare = false, memberFeatures = true, liveMinutes, filters }: GoalStatsProps) {
  // The drill-down reads the property lists directly, not through a hook, so it resolves the read itself: on /demo
  // these are the public routes, for a member the member ones (PUL-34).
  const site = useSiteRef(siteId)
  const frame = useDashboardFrame()
  // Every event the range has, seven to a page. The card used to stop at the seventh with no way to the rest, so a
  // site with more events than that could not see them anywhere (14-11-2026). The pager is the other blocks' own.
  const all = goalCounts || []
  const pageCount = Math.max(1, Math.ceil(all.length / LIMIT))
  // What the list and its opened rows describe: one window under one set of filters.
  const windowKey = `${liveMinutes != null ? `live:${liveMinutes}` : `${dateRange.start}|${dateRange.end}`}|${filters ?? ''}`
  const [page, setPage] = useCardPage(windowKey, pageCount)
  const list = all.slice((page - 1) * LIMIT, page * LIMIT)
  const hasData = all.length > 0
  const emptySlots = Math.max(0, LIMIT - list.length)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [propertyCache, setPropertyCache] = useState<Record<string, PropertyCache>>({})

  // The breakdowns describe ONE window under ONE set of filters. When either changes (another
  // range, entering/leaving realtime, a filter added or taken away), what was fetched for the
  // old one is dropped rather than shown under the new one (PULSE-192). Adjusted during render, React's pattern for
  // state derived from props, so no frame shows the old window's rows.
  const [cachedWindow, setCachedWindow] = useState(windowKey)
  if (cachedWindow !== windowKey) {
    setCachedWindow(windowKey)
    setPropertyCache({})
    setExpanded(new Set())
  }

  const toggleExpand = useCallback(async (eventName: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(eventName)) {
        next.delete(eventName)
        return next
      }
      // In the new frame ONE event is open at a time: opening one closes the one that was open (the owner,
      // 14-11-2026, on finding two open at once). The block has one size there, and two opened events in it are
      // two lists fighting for the same 300 px. Outside the frame every opened event stays open, as before.
      if (frame) return new Set([eventName])
      next.add(eventName)
      return next
    })

    // Fetch properties on first expand. A live window moves on its own, so a live
    // breakdown is fetched afresh on every expand rather than kept.
    const expanding = !expanded.has(eventName)
    if (expanding && (liveMinutes != null || !propertyCache[eventName])) {
      setPropertyCache(prev => ({
        ...prev,
        [eventName]: { keys: [], values: {}, loading: true },
      }))

      try {
        const keys = await getEventPropertyKeys(site, eventName, dateRange.start, dateRange.end, liveMinutes, filters)
        const values: Record<string, EventPropertyValue[]> = {}

        // Fetch all property values in parallel
        await Promise.all(
          keys.map(async (k) => {
            const vals = await getEventPropertyValues(site, eventName, k.key, dateRange.start, dateRange.end, 20, undefined, liveMinutes, filters)
            values[k.key] = vals
          })
        )

        setPropertyCache(prev => ({
          ...prev,
          [eventName]: { keys, values, loading: false },
        }))
      } catch {
        setPropertyCache(prev => ({
          ...prev,
          [eventName]: { keys: [], values: {}, loading: false },
        }))
      }
    }
  }, [expanded, propertyCache, site, dateRange.start, dateRange.end, liveMinutes, frame, filters])

  const content = (
    <>
      {hasData ? (
        // In the frame the block has ONE size, and an opened event's properties can be far taller than it (1,464 px
        // measured for one event). So the rows scroll inside the block: the block, its pager and the page under it
        // stay where they are. The box is 8 px wider on each side and padded back, because a row overhangs the
        // block's content by 8 px (its hover band) and a scroll box would cut that off.
        <div className={frame ? 'frame-scroll -mx-2 min-h-0 flex-1 space-y-2 px-2' : 'space-y-2 flex-1 min-h-[270px]'}>
          {list.map((row) => {
            // Against the whole list's largest count, so a bar means the same on every page.
            const maxCount = all[0]?.count ?? 0
            const barWidth = maxCount > 0 ? (row.count / maxCount) * 75 : 0
            // M12 (owner pick A): a row whose count is imported days only has
            // no properties to show (an export carries none), so it neither
            // expands nor offers to. The server says which rows those are.
            const expandable = memberFeatures && row.instrument !== 'imported'
            const isExpanded = expandable && expanded.has(row.event_name)
            const cache = propertyCache[row.event_name]

            const rowBody = (
              <>
                <div
                  className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.16] md:group-hover:bg-brand-orange/[0.26] rounded-none transition-[width,background-color] ease-apple"
                  style={{ width: `${barWidth}%` }}
                />
                <div className="relative flex items-center flex-1 min-w-0 gap-2">
                  {memberFeatures && !expandable && (
                    // Keeps the name in line with the rows that do expand.
                    <span aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                  {expandable && (
                  <svg
                    className={`w-3.5 h-3.5 text-neutral-500 flex-shrink-0 transition-transform duration-base ${isExpanded ? 'rotate-90' : ''} ease-apple`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  )}
                  <span className="text-sm font-medium text-white truncate">
                    {goalLabel(row)}
                  </span>
                </div>
                {/* No % here by design (F9): these rows count EVENTS, and the
                    events total is not on the wire — any denominator this
                    card could compute would be share-of-visible-rows. */}
                <div className="relative flex items-center gap-2 ml-4">
                  <CompactNumber value={row.count} className="text-sm font-semibold text-neutral-400" />
                </div>
              </>
            )

            return (
              <div key={row.event_name}>
                {/* Event row */}
                {expandable || !memberFeatures ? (
                  <button
                    type="button"
                    aria-expanded={expandable ? isExpanded : undefined}
                    onClick={expandable ? () => toggleExpand(row.event_name) : undefined}
                    data-testid="goal-row"
                    className={`interactive-row ${DIMENSION_ROW} ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {rowBody}
                  </button>
                ) : (
                  // Imported days only: nothing to open, so not a control (M12, owner pick A).
                  <div data-testid="goal-row" className={`interactive-row ${DIMENSION_ROW} cursor-default`}>
                    {rowBody}
                  </div>
                )}

                {/* Expanded property breakdown */}
                <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={TIMING}
                    className="overflow-hidden"
                  >
                  <div className="border-l-2 border-brand-orange/20 ml-[7px] pl-4 py-1">
                    {cache?.loading ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="w-3.5 h-3.5 border-2 border-neutral-600 border-t-brand-orange rounded-full animate-spin" />
                        <span className="text-xs text-neutral-500">Loading properties...</span>
                      </div>
                    ) : cache && cache.keys.length > 0 ? (
                      cache.keys.map((propKey) => {
                        const vals = cache.values[propKey.key] || []
                        const maxVal = vals.length > 0 ? vals[0].count : 1
                        return (
                          <div key={propKey.key}>
                            <div className="text-xs font-medium text-neutral-500 mt-2 mb-1">
                              {propKey.key}
                            </div>
                            {vals.map((v) => {
                              const valBarWidth = maxVal > 0 ? (v.count / maxVal) * 75 : 0
                              return (
                                <div
                                  key={v.value}
                                  className="relative overflow-hidden flex items-center justify-between h-7 rounded-none px-2 -mx-2"
                                >
                                  <div
                                    className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.16] md:group-hover:bg-brand-orange/[0.26] rounded-none transition-[width,background-color] ease-apple"
                                    style={{ width: `${valBarWidth}%` }}
                                  />
                                  <span className="relative text-xs font-medium text-white truncate">
                                    {v.value}
                                  </span>
                                  <CompactNumber value={v.count} className="relative text-sm font-semibold text-neutral-400 ml-4" />
                                </div>
                              )
                            })}
                          </div>
                        )
                      })
                    ) : cache ? (
                      <p className="text-xs text-neutral-500 py-2">No properties recorded</p>
                    ) : null}
                  </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            )
          })}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <CardEmptyState
          // Realtime: the one line every live block reads, where this one used to say "No events tracked yet".
          live={liveMinutes != null}
          icon={<Target />}
          kind="events"
          fresh="Events your site sends are counted here."
          // This block stays empty until the customer sends an event, on a new site as on an old one: the link is
          // to the page that says how (the docs, not the install page, which says nothing about events).
          docs={{ label: 'How to send events', href: docsUrl('custom-events'), whenFresh: true }}
        />
      )}
      <CardFooter>
        <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label="events" />
      </CardFooter>
    </>
  )

  if (bare) return content

  return (
    <div className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <span className="relative px-2.5 py-3 sm:py-1 text-xs font-medium text-white">
            Events
            <span className="absolute inset-x-0 -bottom-px h-[3px] bg-brand-orange rounded-none" />
          </span>
        </div>
      </div>
      {content}
    </div>
  )
}
