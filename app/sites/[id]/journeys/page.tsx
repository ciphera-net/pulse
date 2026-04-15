'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Select, DatePicker } from '@ciphera-net/ui'
import ColumnJourney from '@/components/journeys/ColumnJourney'
import SankeyJourney from '@/components/journeys/SankeyJourney'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { JourneysSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import {
  useJourneyFilters,
  DEPTH_MIN,
  DEPTH_MAX,
  DEPTH_STEP,
  DENSITY_MIN,
  DENSITY_MAX,
  DENSITY_STEP,
  type Period,
} from '@/lib/hooks/useJourneyFilters'
import {
  useDashboard,
  useJourneyTransitions,
  useJourneyEntryPoints,
} from '@/lib/swr/dashboard'

export default function JourneysPage() {
  const params = useParams()
  const siteId = params.id as string

  const filters = useJourneyFilters()
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  const { data: transitionsData, isLoading: transitionsLoading } = useJourneyTransitions(
    siteId,
    filters.dateRange.start,
    filters.dateRange.end,
    filters.committedDepth,
    1,
    filters.entryPath || undefined,
  )
  const { data: entryPoints } = useJourneyEntryPoints(
    siteId,
    filters.dateRange.start,
    filters.dateRange.end,
  )
  const { data: dashboard } = useDashboard(
    siteId,
    filters.dateRange.start,
    filters.dateRange.end,
  )

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
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            Journeys
          </h1>
          <p className="text-sm text-neutral-400">
            How visitors navigate through your site
          </p>
        </div>
        <Select
          variant="input"
          className="min-w-[140px]"
          value={filters.period}
          onChange={(value) => {
            if (value === 'custom') {
              setIsDatePickerOpen(true)
            } else {
              filters.setPeriod(value as Period)
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
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-6 border-b border-white/[0.08]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Depth
                </Label>
                <span className="text-sm font-semibold text-primary tabular-nums">
                  {filters.depth} steps
                </span>
              </div>
              <Slider
                value={[filters.depth]}
                onValueChange={([v]) => filters.setDepth(v)}
                min={DEPTH_MIN}
                max={DEPTH_MAX}
                step={DEPTH_STEP}
                showTooltip
                tooltipContent={(v) => `${v} steps`}
                aria-label={`${filters.depth} steps deep`}
                className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-[3px] [&_[role=slider]]:border-background [&_[role=slider]]:bg-primary [&_[role=slider]]:ring-offset-0"
              />
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Paths per step
                </Label>
                <span className="text-sm font-semibold text-primary tabular-nums">
                  {filters.density} paths
                </span>
              </div>
              <Slider
                value={[filters.density]}
                onValueChange={([v]) => filters.setDensity(v)}
                min={DENSITY_MIN}
                max={DENSITY_MAX}
                step={DENSITY_STEP}
                showTooltip
                tooltipContent={(v) => `${v} paths`}
                aria-label={`${filters.density} paths per step`}
                className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-[3px] [&_[role=slider]]:border-background [&_[role=slider]]:bg-primary [&_[role=slider]]:ring-offset-0"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-6">
            <Select
              variant="input"
              className="flex-1 min-w-[180px]"
              value={filters.entryPath}
              onChange={(value) => filters.setEntryPath(value)}
              options={entryPointOptions}
            />
            <button
              onClick={filters.resetFilters}
              disabled={filters.isDefault}
              className={`text-sm whitespace-nowrap transition-all duration-150 px-3 py-2 ${
                filters.isDefault
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100 text-neutral-500 hover:text-white'
              }`}
            >
              Reset
            </button>
          </div>

          {/* View toggle — matches dashboard tab pattern (CSS scale transition) */}
          <div className="flex gap-1 mt-6 pt-4 border-t border-white/[0.08]" role="tablist" aria-label="Journey view tabs">
            {(['columns', 'flow'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => filters.setViewMode(mode)}
                role="tab"
                aria-selected={filters.viewMode === mode}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  filters.viewMode === mode
                    ? 'text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {mode === 'columns' ? 'Columns' : 'Flow'}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full transition-all duration-200 ${
                    filters.viewMode === mode ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Journey Chart */}
        <div className="p-6">
          {filters.viewMode === 'columns' ? (
            <ColumnJourney
              transitions={transitionsData?.transitions ?? []}
              depth={filters.committedDepth}
              maxPagesPerStep={filters.committedDensity}
            />
          ) : (
            <SankeyJourney
              transitions={transitionsData?.transitions ?? []}
              depth={filters.committedDepth}
              maxPagesPerStep={filters.committedDensity}
            />
          )}
        </div>

        {/* Footer */}
        {totalSessions > 0 && (
          <div className="px-6 pb-5 text-sm text-neutral-400">
            {totalSessions.toLocaleString()} sessions tracked
          </div>
        )}
      </div>

      {/* Date Picker Modal */}
      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={(range) => {
          filters.setPeriod('custom', range)
          setIsDatePickerOpen(false)
        }}
        initialRange={filters.dateRange}
      />
    </div>
  )
}
