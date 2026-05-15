'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { getDateRange, formatDate } from '@/lib/utils/dateRanges'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { PERIOD_TO_API } from '@/lib/constants/periods'
import dynamic from 'next/dynamic'
import { getRageClicks, getDeadClicks } from '@/lib/api/stats'
import FrustrationSummaryCards from '@/components/behavior/FrustrationSummaryCards'
import FrustrationTable from '@/components/behavior/FrustrationTable'
import FrustrationByPageTable from '@/components/behavior/FrustrationByPageTable'
import FrustrationTrend from '@/components/behavior/FrustrationTrend'
import { useSite, useBehavior } from '@/lib/swr/dashboard'
import { BehaviorSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'

const ScrollDepth = dynamic(() => import('@/components/dashboard/ScrollDepth'))

export default function BehaviorPage() {
  const params = useParams()
  const siteId = params.id as string

  const [period, setPeriod] = useState('30')
  const [dateRange, setDateRange] = useState(() => getDateRange(30))

  const apiPeriod = period !== 'custom' ? (PERIOD_TO_API[period] || undefined) : undefined

  // Single request for all frustration data
  const { data: behavior, isLoading: loading, error: behaviorError } = useBehavior(siteId, dateRange.start, dateRange.end, apiPeriod)

  const { data: site } = useSite(siteId)

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
    const domain = site?.domain
    document.title = domain ? `Behavior · ${domain} | Pulse` : 'Behavior | Pulse'
  }, [site?.domain])

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
        <DateRangePicker
          period={period}
          dateRange={dateRange}
          onPeriodChange={setPeriod}
          onDateRangeChange={setDateRange}
          onShift={shiftPeriod}
        />
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
          <ScrollDepth scrollDepth={behavior?.scroll_depth} />
          <FrustrationTrend summary={summary} loading={loading} />
        </motion.div>
      )}

    </div>
  )
}
