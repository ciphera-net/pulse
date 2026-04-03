'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { formatNumber } from '@ciphera-net/ui'
import { BookOpenIcon, ArrowRightIcon } from '@ciphera-net/ui'
import type { GoalCountStat } from '@/lib/api/stats'
import { getEventPropertyKeys, getEventPropertyValues, type EventPropertyKey, type EventPropertyValue } from '@/lib/api/stats'

interface GoalStatsProps {
  goalCounts: GoalCountStat[]
  siteId: string
  dateRange: { start: string; end: string }
}

interface PropertyCache {
  keys: EventPropertyKey[]
  values: Record<string, EventPropertyValue[]> // keyed by property key name
  loading: boolean
}

const LIMIT = 7

export default function GoalStats({ goalCounts, siteId, dateRange }: GoalStatsProps) {
  const list = (goalCounts || []).slice(0, LIMIT)
  const hasData = list.length > 0
  const total = list.reduce((sum, r) => sum + r.count, 0)
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

  return (
    <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <span className="relative px-2.5 py-1 text-xs font-medium text-white">
            Events
            <span className="absolute inset-x-0 -bottom-px h-[3px] bg-brand-orange rounded-full" />
          </span>
        </div>
      </div>

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
                <div
                  onClick={() => toggleExpand(row.event_name)}
                  className="relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
                >
                  <div
                    className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="relative flex items-center flex-1 min-w-0 gap-2">
                    <svg
                      className={`w-3.5 h-3.5 text-neutral-500 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium text-white truncate">
                      {row.display_name ?? row.event_name.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="relative flex items-center gap-2 ml-4">
                    <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                      {total > 0 ? `${Math.round((row.count / total) * 100)}%` : ''}
                    </span>
                    <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                      {formatNumber(row.count)}
                    </span>
                  </div>
                </div>

                {/* Expanded property breakdown */}
                {isExpanded && (
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
                                  className="relative flex items-center justify-between h-7 rounded-md px-2 -mx-2"
                                >
                                  <div
                                    className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
                                    style={{ width: `${valBarWidth}%` }}
                                  />
                                  <span className="relative text-xs font-medium text-white truncate">
                                    {v.value}
                                  </span>
                                  <span className="relative text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
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
                )}
              </div>
            )
          })}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
          <div className="rounded-full bg-neutral-800 p-4">
            <BookOpenIcon className="w-8 h-8 text-neutral-400" />
          </div>
          <h4 className="font-semibold text-white">
            Need help tracking goals?
          </h4>
          <p className="text-sm text-neutral-400 max-w-md">
            Add <code className="px-1.5 py-0.5 rounded bg-neutral-700 text-xs font-mono">pulse.track(&apos;event_name&apos;)</code> where actions happen on your site, then see counts here. Check our guide for step-by-step instructions.
          </p>
          <Link
            href="/installation"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/20 rounded"
          >
            Read documentation
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
