'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getDateRange, formatDate } from '@ciphera-net/ui'
import { Select, DatePicker } from '@ciphera-net/ui'
import dynamic from 'next/dynamic'
import { getRageClicks, getDeadClicks } from '@/lib/api/stats'
import FrustrationSummaryCards from '@/components/behavior/FrustrationSummaryCards'
import FrustrationTable from '@/components/behavior/FrustrationTable'
import FrustrationByPageTable from '@/components/behavior/FrustrationByPageTable'
import FrustrationTrend from '@/components/behavior/FrustrationTrend'
import { useDashboard, useBehavior } from '@/lib/swr/dashboard'
import { BehaviorSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'

const ScrollDepth = dynamic(() => import('@/components/dashboard/ScrollDepth'))

function getThisWeekRange(): { start: string; end: string } {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return { start: formatDate(monday), end: formatDate(today) }
}

function getThisMonthRange(): { start: string; end: string } {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: formatDate(firstOfMonth), end: formatDate(today) }
}

export default function BehaviorPage() {
  const params = useParams()
  const siteId = params.id as string

  const [period, setPeriod] = useState('30')
  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  // Single request for all frustration data
  const { data: behavior, isLoading: loading, error: behaviorError } = useBehavior(siteId, dateRange.start, dateRange.end)

  // Fetch dashboard data for scroll depth (goal_counts + stats)
  const { data: dashboard } = useDashboard(siteId, dateRange.start, dateRange.end)

  const showSkeleton = useMinimumLoading(loading && !behavior)
  const fadeClass = useSkeletonFade(showSkeleton)

  useEffect(() => {
    const domain = dashboard?.site?.domain
    document.title = domain ? `Behavior · ${domain} | Pulse` : 'Behavior | Pulse'
  }, [dashboard?.site?.domain])

  // On-demand fetchers for modal "view all"
  const fetchAllRage = useCallback(
    () => getRageClicks(siteId, dateRange.start, dateRange.end, 100),
    [siteId, dateRange.start, dateRange.end]
  )

  const fetchAllDead = useCallback(
    () => getDeadClicks(siteId, dateRange.start, dateRange.end, 100),
    [siteId, dateRange.start, dateRange.end]
  )

  const summary = behavior?.summary ?? null
  const rageClicks = behavior?.rage_clicks ?? { items: [], total: 0 }
  const deadClicks = behavior?.dead_clicks ?? { items: [], total: 0 }
  const byPage = behavior?.by_page ?? []

  if (showSkeleton) return <BehaviorSkeleton />

  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
            Behavior
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Frustration signals and user engagement patterns
          </p>
        </div>
        <Select
          variant="input"
          className="min-w-[140px]"
          value={period}
          onChange={(value) => {
            if (value === 'today') {
              const today = formatDate(new Date())
              setDateRange({ start: today, end: today })
              setPeriod('today')
            } else if (value === '7') {
              setDateRange(getDateRange(7))
              setPeriod('7')
            } else if (value === 'week') {
              setDateRange(getThisWeekRange())
              setPeriod('week')
            } else if (value === '30') {
              setDateRange(getDateRange(30))
              setPeriod('30')
            } else if (value === 'month') {
              setDateRange(getThisMonthRange())
              setPeriod('month')
            } else if (value === 'custom') {
              setIsDatePickerOpen(true)
            }
          }}
          options={[
            { value: 'today', label: 'Today' },
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: 'divider-1', label: '', divider: true },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'divider-2', label: '', divider: true },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </div>

      {/* Summary cards */}
      <FrustrationSummaryCards data={summary} loading={loading} />

      {/* Rage clicks + Dead clicks side by side */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <FrustrationTable
          title="Rage Clicks"
          description="Elements users clicked repeatedly in frustration"
          items={rageClicks.items}
          total={rageClicks.total}
          totalSignals={summary?.rage_clicks ?? 0}
          showAvgClicks
          loading={loading}
          fetchAll={fetchAllRage}
        />
        <FrustrationTable
          title="Dead Clicks"
          description="Elements users clicked that produced no response"
          items={deadClicks.items}
          total={deadClicks.total}
          totalSignals={summary?.dead_clicks ?? 0}
          loading={loading}
          fetchAll={fetchAllDead}
        />
      </div>

      {/* By page breakdown */}
      <FrustrationByPageTable pages={byPage} loading={loading} />

      {/* Scroll depth + Frustration trend — hide when data failed to load */}
      {!behaviorError && (
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <ScrollDepth
            goalCounts={dashboard?.goal_counts ?? []}
            totalPageviews={dashboard?.stats?.pageviews ?? 0}
          />
          <FrustrationTrend summary={summary} loading={loading} />
        </div>
      )}

      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={(range) => {
          setDateRange(range)
          setPeriod('custom')
          setIsDatePickerOpen(false)
        }}
        initialRange={dateRange}
      />
    </div>
  )
}
