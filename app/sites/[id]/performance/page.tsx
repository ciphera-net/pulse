'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getDateRange, formatDate } from '@ciphera-net/ui'
import { Select, DatePicker } from '@ciphera-net/ui'
import { getPerformanceByPage } from '@/lib/api/stats'
import { useDashboard } from '@/lib/swr/dashboard'
import { useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import dynamic from 'next/dynamic'

const PerformanceStats = dynamic(() => import('@/components/dashboard/PerformanceStats'))

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

function PerformanceSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 animate-pulse">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="h-7 w-40 bg-neutral-200 dark:bg-neutral-800 rounded mb-2" />
          <div className="h-4 w-64 bg-neutral-200 dark:bg-neutral-800 rounded" />
        </div>
        <div className="h-9 w-36 bg-neutral-200 dark:bg-neutral-800 rounded" />
      </div>
      <div className="h-6 w-24 bg-neutral-200 dark:bg-neutral-800 rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-neutral-200 dark:bg-neutral-800 rounded-2xl" />
    </div>
  )
}

export default function PerformancePage() {
  const params = useParams()
  const siteId = params.id as string

  const [period, setPeriod] = useState('30')
  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  const { data: dashboard, isLoading: loading } = useDashboard(siteId, dateRange.start, dateRange.end)

  const site = dashboard?.site ?? null
  const showSkeleton = useMinimumLoading(loading && !dashboard)
  const fadeClass = useSkeletonFade(showSkeleton)

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Performance \u00b7 ${domain} | Pulse` : 'Performance | Pulse'
  }, [site?.domain])

  if (showSkeleton) return <PerformanceSkeleton />

  if (site && !site.enable_performance_insights) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <div className="text-center py-16">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
            Performance insights are disabled
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Enable performance insights in your site settings to start collecting Core Web Vitals data.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
            Performance
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Core Web Vitals from real user sessions
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

      <PerformanceStats
        stats={dashboard?.performance ?? null}
        performanceByPage={dashboard?.performance_by_page ?? null}
        siteId={siteId}
        startDate={dateRange.start}
        endDate={dateRange.end}
        getPerformanceByPage={getPerformanceByPage}
      />

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
