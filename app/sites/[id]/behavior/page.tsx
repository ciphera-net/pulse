'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { getDateRange, formatDate, getThisWeekRange, getThisMonthRange } from '@/lib/utils/dateRanges'
import { Select, DatePicker, ChevronLeftIcon, ChevronRightIcon } from '@ciphera-net/ui'
import dynamic from 'next/dynamic'
import { getRageClicks, getDeadClicks } from '@/lib/api/stats'
import FrustrationSummaryCards from '@/components/behavior/FrustrationSummaryCards'
import FrustrationTable from '@/components/behavior/FrustrationTable'
import FrustrationByPageTable from '@/components/behavior/FrustrationByPageTable'
import FrustrationTrend from '@/components/behavior/FrustrationTrend'
import { useDashboard, useBehavior } from '@/lib/swr/dashboard'
import { BehaviorSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'

const ScrollDepth = dynamic(() => import('@/components/dashboard/ScrollDepth'))

export default function BehaviorPage() {
  const params = useParams()
  const siteId = params.id as string

  const [period, setPeriod] = useState('30')
  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  // Map frontend period values to backend period names
  const PERIOD_TO_API: Record<string, string> = {
    'today': 'today',
    '7': '7d',
    'week': 'week',
    '30': '30d',
    'month': 'month',
  }

  // For relative periods send the period name; for custom ranges send dates
  const apiPeriod = period !== 'custom' ? (PERIOD_TO_API[period] || undefined) : undefined

  // Single request for all frustration data
  const { data: behavior, isLoading: loading, error: behaviorError } = useBehavior(siteId, dateRange.start, dateRange.end, apiPeriod)

  // Fetch dashboard data for scroll depth (goal_counts + stats)
  const { data: dashboard } = useDashboard(siteId, dateRange.start, dateRange.end, undefined, undefined, apiPeriod)

  const shiftPeriod = useCallback((direction: -1 | 1) => {
    const shift = (date: string, days: number) => {
      const d = new Date(date + 'T00:00:00')
      d.setDate(d.getDate() + days)
      return formatDate(d)
    }
    const startDate = new Date(dateRange.start + 'T00:00:00')
    const endDate = new Date(dateRange.end + 'T00:00:00')
    const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    const offsetDays = spanDays * direction
    const newRange = { start: shift(dateRange.start, offsetDays), end: shift(dateRange.end, offsetDays) }
    const today = formatDate(new Date())
    if (newRange.end > today) return
    setDateRange(newRange)
    setPeriod('custom')
  }, [dateRange])

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
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            Behavior
          </h1>
          <p className="text-sm text-neutral-400">
            Frustration signals and user engagement patterns
          </p>
        </div>
        <div className="flex items-center h-10 rounded-lg border border-white/[0.08] bg-neutral-900/80 shadow-sm">
          <button onClick={() => shiftPeriod(-1)} className="px-2 h-full text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors rounded-l-lg ease-apple" aria-label="Previous period">
            <ChevronLeftIcon className="w-4 h-4" weight="bold" />
          </button>
          <div className="w-px h-5 bg-white/[0.08]" />
          <Select
            variant="ghost"
            className="min-w-[130px]"
            value={period}
            onChange={(value) => {
              if (value === '1h') {
                const now = new Date()
                const end = formatDate(now)
                const start = formatDate(now)
                setDateRange({ start, end })
                setPeriod('1h')
              } else if (value === '24h') {
                setDateRange(getDateRange(1))
                setPeriod('24h')
              } else if (value === 'today') {
                const today = formatDate(new Date())
                setDateRange({ start: today, end: today })
                setPeriod('today')
              } else if (value === 'yesterday') {
                const d = new Date()
                d.setDate(d.getDate() - 1)
                const y = formatDate(d)
                setDateRange({ start: y, end: y })
                setPeriod('yesterday')
              } else if (value === '7') {
                setDateRange(getDateRange(7))
                setPeriod('7')
              } else if (value === '30') {
                setDateRange(getDateRange(30))
                setPeriod('30')
              } else if (value === 'week') {
                setDateRange(getThisWeekRange())
                setPeriod('week')
              } else if (value === 'month') {
                setDateRange(getThisMonthRange())
                setPeriod('month')
              } else if (value === 'year') {
                setDateRange(getDateRange(365))
                setPeriod('year')
              } else if (value === 'custom') {
                setIsDatePickerOpen(true)
              }
            }}
            options={[
              { value: '1h', label: 'Last hour' },
              { value: '24h', label: 'Last 24 hours' },
              { value: 'divider-1', label: '', divider: true },
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: 'divider-2', label: '', divider: true },
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
              { value: 'year', label: 'This year' },
              { value: 'divider-3', label: '', divider: true },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          <div className="w-px h-5 bg-white/[0.08]" />
          <button onClick={() => shiftPeriod(1)} className="px-2 h-full text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors rounded-r-lg ease-apple" aria-label="Next period">
            <ChevronRightIcon className="w-4 h-4" weight="bold" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0 }}
      >
        <FrustrationSummaryCards data={summary} loading={loading} />
      </motion.div>

      {/* Rage clicks + Dead clicks side by side */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.05 }}
        className="grid gap-6 lg:grid-cols-2 mb-8 [&>*]:min-w-0"
      >
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
      </motion.div>

      {/* By page breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.1 }}
      >
        <FrustrationByPageTable pages={byPage} loading={loading} />
      </motion.div>

      {/* Scroll depth + Frustration trend — hide when data failed to load */}
      {!behaviorError && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.15 }}
          className="grid gap-6 lg:grid-cols-2 mb-8 [&>*]:min-w-0"
        >
          <ScrollDepth scrollDepth={dashboard?.scroll_depth} />
          <FrustrationTrend summary={summary} loading={loading} />
        </motion.div>
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
