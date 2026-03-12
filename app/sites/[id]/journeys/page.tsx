'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getDateRange, formatDate } from '@ciphera-net/ui'
import { Select, DatePicker } from '@ciphera-net/ui'
import SankeyDiagram from '@/components/journeys/SankeyDiagram'
import TopPathsTable from '@/components/journeys/TopPathsTable'
import { SkeletonCard } from '@/components/skeletons'
import {
  useDashboard,
  useJourneyTransitions,
  useJourneyTopPaths,
  useJourneyEntryPoints,
} from '@/lib/swr/dashboard'

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

export default function JourneysPage() {
  const params = useParams()
  const siteId = params.id as string

  const [period, setPeriod] = useState('30')
  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [depth, setDepth] = useState(5)
  const [entryPath, setEntryPath] = useState('')

  const { data: transitionsData, isLoading: transitionsLoading } = useJourneyTransitions(
    siteId, dateRange.start, dateRange.end, depth, 3, entryPath || undefined
  )
  const { data: topPaths, isLoading: topPathsLoading } = useJourneyTopPaths(
    siteId, dateRange.start, dateRange.end, 20, 3, entryPath || undefined
  )
  const { data: entryPoints } = useJourneyEntryPoints(siteId, dateRange.start, dateRange.end)
  const { data: dashboard } = useDashboard(siteId, dateRange.start, dateRange.end)

  useEffect(() => {
    const domain = dashboard?.site?.domain
    document.title = domain ? `Journeys \u00b7 ${domain} | Pulse` : 'Journeys | Pulse'
  }, [dashboard?.site?.domain])

  const entryPointOptions = [
    { value: '', label: 'All entry points' },
    ...(entryPoints ?? []).map((ep) => ({
      value: ep.path,
      label: `${ep.path} (${ep.session_count.toLocaleString()})`,
    })),
  ]

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
            Journeys
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            How visitors navigate through your site
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

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-500 dark:text-neutral-400">Depth</label>
          <input
            type="range"
            min={2}
            max={10}
            step={1}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-32 accent-brand-orange"
          />
          <span className="text-sm font-medium text-neutral-900 dark:text-white w-4">{depth}</span>
        </div>

        <Select
          variant="input"
          className="min-w-[180px]"
          value={entryPath}
          onChange={(value) => setEntryPath(value)}
          options={entryPointOptions}
        />

        {(depth !== 5 || entryPath) && (
          <button
            onClick={() => { setDepth(5); setEntryPath('') }}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Sankey Diagram */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 mb-6">
        {transitionsLoading ? (
          <div className="h-[400px] flex items-center justify-center">
            <SkeletonCard className="w-full h-full" />
          </div>
        ) : (
          <SankeyDiagram
            transitions={transitionsData?.transitions ?? []}
            totalSessions={transitionsData?.total_sessions ?? 0}
            depth={depth}
            onNodeClick={(path) => setEntryPath(path)}
          />
        )}
      </div>

      {/* Top Paths */}
      <TopPathsTable paths={topPaths ?? []} loading={topPathsLoading} />

      {/* Date Picker Modal */}
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
