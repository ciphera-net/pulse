'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getDateRange, formatDate } from '@ciphera-net/ui'
import { Select, DatePicker } from '@ciphera-net/ui'
import SankeyDiagram from '@/components/journeys/SankeyDiagram'
import { JourneysSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import {
  useDashboard,
  useJourneyTransitions,
  useJourneyEntryPoints,
} from '@/lib/swr/dashboard'

const DEPTH_STEPS = [2, 3, 4, 5, 6, 7, 8, 9, 10]

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
  const [depth, setDepth] = useState(3)
  const [displayDepth, setDisplayDepth] = useState(3)
  const [entryPath, setEntryPath] = useState('')

  const sliderIndex = DEPTH_STEPS.indexOf(displayDepth)

  const { data: transitionsData, isLoading: transitionsLoading } = useJourneyTransitions(
    siteId, dateRange.start, dateRange.end, depth, 1, entryPath || undefined
  )
  const { data: entryPoints } = useJourneyEntryPoints(siteId, dateRange.start, dateRange.end)
  const { data: dashboard } = useDashboard(siteId, dateRange.start, dateRange.end)

  useEffect(() => {
    const domain = dashboard?.site?.domain
    document.title = domain ? `Journeys \u00b7 ${domain} | Pulse` : 'Journeys | Pulse'
  }, [dashboard?.site?.domain])

  const showSkeleton = useMinimumLoading(transitionsLoading && !transitionsData)
  const fadeClass = useSkeletonFade(showSkeleton)

  const entryPointOptions = [
    { value: '', label: 'All entry points' },
    ...(entryPoints ?? []).map((ep) => ({
      value: ep.path,
      label: `${ep.path} (${ep.session_count.toLocaleString()})`,
    })),
  ]

  if (showSkeleton) return <JourneysSkeleton />

  const totalSessions = transitionsData?.total_sessions ?? 0

  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
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

      {/* Single card: toolbar + chart */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            {/* Depth slider */}
            <div className="flex-1">
              <div className="flex justify-between text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-3">
                <span>2 steps</span>
                <span className="text-brand-orange font-bold">
                  {displayDepth} steps deep
                </span>
                <span>10 steps</span>
              </div>
              <input
                type="range"
                min="0"
                max={DEPTH_STEPS.length - 1}
                step="1"
                value={sliderIndex}
                onChange={(e) => setDisplayDepth(DEPTH_STEPS[parseInt(e.target.value)])}
                onMouseUp={(e) => setDepth(DEPTH_STEPS[parseInt((e.target as HTMLInputElement).value)])}
                onTouchEnd={(e) => setDepth(DEPTH_STEPS[parseInt((e.target as HTMLInputElement).value)])}
                aria-label="Journey depth"
                aria-valuetext={`${displayDepth} steps deep`}
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700 accent-brand-orange focus:outline-none"
              />
            </div>

            {/* Entry point + Reset */}
            <div className="flex items-center gap-3 shrink-0">
              <Select
                variant="input"
                className="min-w-[180px]"
                value={entryPath}
                onChange={(value) => setEntryPath(value)}
                options={entryPointOptions}
              />
              {(depth !== 3 || entryPath) && (
                <button
                  onClick={() => { setDepth(3); setDisplayDepth(3); setEntryPath('') }}
                  className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sankey Diagram */}
        <div className="p-6">
          <SankeyDiagram
            transitions={transitionsData?.transitions ?? []}
            totalSessions={totalSessions}
            depth={depth}
            onNodeClick={(path) => setEntryPath(path)}
          />
        </div>

        {/* Footer */}
        {totalSessions > 0 && (
          <div className="px-6 pb-5 text-sm text-neutral-500 dark:text-neutral-400">
            {totalSessions.toLocaleString()} sessions tracked
          </div>
        )}
      </div>

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
