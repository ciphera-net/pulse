'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TIMING } from '@/lib/motion'
import { Target } from '@phosphor-icons/react'
import { formatNumber } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/EmptyState'
import type { GoalCountStat } from '@/lib/api/stats'
import { getEventPropertyKeys, getEventPropertyValues, type EventPropertyKey, type EventPropertyValue } from '@/lib/api/stats'

interface GoalStatsProps {
  goalCounts: GoalCountStat[]
  siteId: string
  dateRange: { start: string; end: string }
  // Render only the list, no card chrome/header — for composition inside the
  // Content section's tabbed card (Scroll depth · Events).
  bare?: boolean
  // Off on the public share surface (02-09-2026): expanding a row fetches the
  // member-strict event-properties endpoints, so the rows render plain there —
  // no chevron, no aria-expanded, no fetch to fail.
  memberFeatures?: boolean
}

interface PropertyCache {
  keys: EventPropertyKey[]
  values: Record<string, EventPropertyValue[]> // keyed by property key name
  loading: boolean
}

const LIMIT = 7

export default function GoalStats({ goalCounts, siteId, dateRange, bare = false, memberFeatures = true }: GoalStatsProps) {
  const list = (goalCounts || []).slice(0, LIMIT)
  const hasData = list.length > 0
  const emptySlots = Math.max(0, LIMIT - list.length)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [propertyCache, setPropertyCache] = useState<Record<string, PropertyCache>>({})

  const toggleExpand = useCallback(async (eventName: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(eventName)) {
        next.delete(eventName)
      } else {
        next.add(eventName)
      }
      return next
    })

    // Fetch properties on first expand
    if (!propertyCache[eventName]) {
      setPropertyCache(prev => ({
        ...prev,
        [eventName]: { keys: [], values: {}, loading: true },
      }))

      try {
        const keys = await getEventPropertyKeys(siteId, eventName, dateRange.start, dateRange.end)
        const values: Record<string, EventPropertyValue[]> = {}

        // Fetch all property values in parallel
        await Promise.all(
          keys.map(async (k) => {
            const vals = await getEventPropertyValues(siteId, eventName, k.key, dateRange.start, dateRange.end)
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
  }, [propertyCache, siteId, dateRange.start, dateRange.end])

  const content = (
    <>
      {hasData ? (
        <div className="space-y-2 flex-1 min-h-[270px]">
          {list.map((row) => {
            const maxCount = list[0]?.count ?? 0
            const barWidth = maxCount > 0 ? (row.count / maxCount) * 75 : 0
            const isExpanded = expanded.has(row.event_name)
            const cache = propertyCache[row.event_name]

            return (
              <div key={row.event_name}>
                {/* Event row */}
                <button
                  type="button"
                  aria-expanded={memberFeatures ? isExpanded : undefined}
                  onClick={memberFeatures ? () => toggleExpand(row.event_name) : undefined}
                  className={`interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2 ${memberFeatures ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div
                    className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.16] md:group-hover:bg-brand-orange/[0.26] rounded-none transition-[width,background-color] ease-apple"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="relative flex items-center flex-1 min-w-0 gap-2">
                    {memberFeatures && (
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
                      {row.display_name ?? row.event_name.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {/* No % here by design (F9): these rows count EVENTS, and the
                      events total is not on the wire — any denominator this
                      card could compute would be share-of-visible-rows. */}
                  <div className="relative flex items-center gap-2 ml-4">
                    <span className="text-sm font-semibold text-neutral-400">
                      {formatNumber(row.count)}
                    </span>
                  </div>
                </button>

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
                                  <span className="relative text-sm font-semibold text-neutral-400 ml-4">
                                    {formatNumber(v.count)}
                                  </span>
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
        <EmptyState
          icon={<Target />}
          title="No events tracked yet"
          description="Add pulse.track('event') where actions happen on your site, then see conversion counts here."
          action={{ label: 'Read the docs', href: '/installation' }}
        />
      )}
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
