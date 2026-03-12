'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { getDateRange, formatDate } from '@ciphera-net/ui'
import { Select, DatePicker } from '@ciphera-net/ui'
import { toast } from '@ciphera-net/ui'
import dynamic from 'next/dynamic'
import {
  getFrustrationSummary,
  getRageClicks,
  getDeadClicks,
  getFrustrationByPage,
  type FrustrationSummary,
  type FrustrationElement,
  type FrustrationByPage,
} from '@/lib/api/stats'
import FrustrationSummaryCards from '@/components/behavior/FrustrationSummaryCards'
import FrustrationTable from '@/components/behavior/FrustrationTable'
import FrustrationByPageTable from '@/components/behavior/FrustrationByPageTable'
import { useDashboard } from '@/lib/swr/dashboard'

const ScrollDepth = dynamic(() => import('@/components/dashboard/ScrollDepth'))

const TABLE_LIMIT = 7

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

  // Frustration data
  const [summary, setSummary] = useState<FrustrationSummary | null>(null)
  const [rageClicks, setRageClicks] = useState<{ items: FrustrationElement[]; total: number }>({ items: [], total: 0 })
  const [deadClicks, setDeadClicks] = useState<{ items: FrustrationElement[]; total: number }>({ items: [], total: 0 })
  const [byPage, setByPage] = useState<FrustrationByPage[]>([])
  const [loading, setLoading] = useState(true)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch dashboard data for scroll depth (goal_counts + stats)
  const { data: dashboard } = useDashboard(siteId, dateRange.start, dateRange.end)

  const fetchData = useCallback(async () => {
    try {
      const [summaryData, rageData, deadData, pageData] = await Promise.all([
        getFrustrationSummary(siteId, dateRange.start, dateRange.end),
        getRageClicks(siteId, dateRange.start, dateRange.end, TABLE_LIMIT),
        getDeadClicks(siteId, dateRange.start, dateRange.end, TABLE_LIMIT),
        getFrustrationByPage(siteId, dateRange.start, dateRange.end),
      ])
      setSummary(summaryData)
      setRageClicks(rageData)
      setDeadClicks(deadData)
      setByPage(pageData)
    } catch {
      toast.error('Failed to load behavior data')
    } finally {
      setLoading(false)
    }
  }, [siteId, dateRange.start, dateRange.end])

  // Fetch on mount and when date range changes
  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  // 60-second refresh interval
  useEffect(() => {
    refreshRef.current = setInterval(fetchData, 60_000)
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current)
    }
  }, [fetchData])

  useEffect(() => {
    document.title = 'Behavior | Pulse'
  }, [])

  const fetchAllRage = useCallback(
    () => getRageClicks(siteId, dateRange.start, dateRange.end, 100),
    [siteId, dateRange.start, dateRange.end]
  )

  const fetchAllDead = useCallback(
    () => getDeadClicks(siteId, dateRange.start, dateRange.end, 100),
    [siteId, dateRange.start, dateRange.end]
  )

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
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
          showAvgClicks
          loading={loading}
          fetchAll={fetchAllRage}
        />
        <FrustrationTable
          title="Dead Clicks"
          description="Elements users clicked that produced no response"
          items={deadClicks.items}
          total={deadClicks.total}
          loading={loading}
          fetchAll={fetchAllDead}
        />
      </div>

      {/* By page breakdown */}
      <FrustrationByPageTable pages={byPage} loading={loading} />

      {/* Scroll depth */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <ScrollDepth
          goalCounts={dashboard?.goal_counts ?? []}
          totalPageviews={dashboard?.stats?.pageviews ?? 0}
        />
      </div>

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
