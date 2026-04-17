'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ApiError } from '@/lib/api/client'
import { getFunnel, getFunnelStats, getFunnelTrends, deleteFunnel, type Funnel, type FunnelStats, type FunnelTrends } from '@/lib/api/funnels'
import FilterPanel from '@/components/dashboard/FilterPanel'
import { type DimensionFilter, serializeFilters } from '@/lib/filters'
import { toast, Select, DatePicker, ChevronLeftIcon, ArrowRightIcon, TrashIcon, Button } from '@ciphera-net/ui'
import { PencilSimple } from '@phosphor-icons/react'
import { FunnelDetailSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import Link from 'next/link'
import { FunnelChart } from '@/components/ui/funnel-chart'
import { getDateRange } from '@ciphera-net/ui'
import BreakdownDrawer from '@/components/funnels/BreakdownDrawer'
import { LineChart, Line, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/line-chart'

export default function FunnelReportPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string
  const funnelId = params.funnelId as string

  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [stats, setStats] = useState<FunnelStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [datePreset, setDatePreset] = useState<'7' | '30' | 'custom'>('30')
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [loadError, setLoadError] = useState<'not_found' | 'forbidden' | 'error' | null>(null)
  const [filters, setFilters] = useState<DimensionFilter[]>([])
  const [expandedExitStep, setExpandedExitStep] = useState<number | null>(null)
  const [trends, setTrends] = useState<FunnelTrends | null>(null)
  const [visibleSteps, setVisibleSteps] = useState<Set<string>>(new Set())
  const [breakdownStep, setBreakdownStep] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      setLoading(true)
      const filterStr = serializeFilters(filters) || undefined
      const [funnelData, statsData, trendsData] = await Promise.all([
        getFunnel(siteId, funnelId),
        getFunnelStats(siteId, funnelId, dateRange.start, dateRange.end, filterStr),
        getFunnelTrends(siteId, funnelId, dateRange.start, dateRange.end, 'day', filterStr)
      ])
      setFunnel(funnelData)
      setStats(statsData)
      setTrends(trendsData)
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0
      if (status === 404) setLoadError('not_found')
      else if (status === 403) setLoadError('forbidden')
      else setLoadError('error')
      if (status !== 404 && status !== 403) toast.error('Failed to load funnel details')
    } finally {
      setLoading(false)
    }
  }, [siteId, funnelId, dateRange, filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this funnel?')) return

    try {
      await deleteFunnel(siteId, funnelId)
      toast.success('Funnel deleted')
      router.push(`/sites/${siteId}/funnels`)
    } catch (error) {
      toast.error('Failed to delete funnel')
    }
  }

  const showSkeleton = useMinimumLoading(loading && !funnel)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) {
    return <FunnelDetailSkeleton />
  }

  if (loadError === 'not_found' || (!funnel && !stats && !loadError)) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-400">Funnel not found</p>
      </div>
    )
  }

  if (loadError === 'forbidden') {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-400">Access denied</p>
        <Link href={`/sites/${siteId}/funnels`}>
          <Button variant="primary" className="mt-4">
            Back to Funnels
          </Button>
        </Link>
      </div>
    )
  }

  if (loadError === 'error') {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-400 mb-4">Unable to load funnel</p>
        <Button type="button" onClick={() => loadData()} variant="primary">
          Try again
        </Button>
      </div>
    )
  }

  if (!funnel || !stats) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-400">Funnel not found</p>
      </div>
    )
  }

  const chartData = stats.steps.map(s => ({
    label: s.step.name,
    value: s.visitors,
  }))

  const STEP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

  const trendsChartData = trends ? trends.dates.map((date, idx) => {
    const point: Record<string, any> = {
      date: new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      overall: Math.round(trends.overall[idx] * 10) / 10,
    }
    for (const [stepKey, values] of Object.entries(trends.steps)) {
      if (visibleSteps.has(stepKey)) {
        point[`step_${stepKey}`] = Math.round(values[idx] * 10) / 10
      }
    }
    return point
  }) : []

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link 
              href={`/sites/${siteId}/funnels`}
              className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors ease-apple"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-neutral-200">
                {funnel.name}
              </h1>
              {funnel.description && (
                <p className="text-neutral-400">
                  {funnel.description}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select
              value={datePreset}
              onChange={(value) => {
                if (value === '7') {
                  setDateRange(getDateRange(7))
                  setDatePreset('7')
                } else if (value === '30') {
                  setDateRange(getDateRange(30))
                  setDatePreset('30')
                } else if (value === 'custom') {
                  setIsDatePickerOpen(true)
                }
              }}
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            
            <Link
              href={`/sites/${siteId}/funnels/${funnelId}/edit`}
              className="p-2 text-neutral-400 hover:text-brand-orange hover:bg-orange-900/20 rounded-xl transition-colors ease-apple"
              aria-label="Edit funnel"
            >
              <PencilSimple className="w-5 h-5" />
            </Link>
            <button
              onClick={handleDelete}
              className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-xl transition-colors ease-apple"
              aria-label="Delete funnel"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <FilterPanel
            filters={filters}
            onApply={(newFilters) => setFilters(newFilters)}
          />
        </div>

        {/* Chart */}
        <div className="glass-surface rounded-2xl overflow-hidden shadow-sm p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-6">
            Funnel Visualization
          </h3>
          <FunnelChart
            data={chartData}
            orientation="horizontal"
            color="var(--chart-1)"
            layers={3}
            labelLayout="grouped"
            labelAlign="center"
            labelOrientation="vertical"
            style={{ aspectRatio: '4 / 1' }}
          />
        </div>

        {/* Conversion Trends */}
        {trends && trends.dates.length > 1 && (
          <div className="glass-surface rounded-2xl overflow-hidden shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Conversion Trends
              </h3>
              <div className="flex flex-wrap gap-2">
                {stats?.steps.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setVisibleSteps(prev => {
                        const next = new Set(prev)
                        if (next.has(String(i))) next.delete(String(i))
                        else next.add(String(i))
                        return next
                      })
                    }}
                    className={`px-2 py-1 text-xs rounded-md transition-colors ${
                      visibleSteps.has(String(i))
                        ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/30'
                        : 'bg-neutral-800 text-neutral-500 border border-transparent'
                    } ease-apple`}
                  >
                    {s.step.name}
                  </button>
                ))}
              </div>
            </div>

            <LineChart
              data={trendsChartData}
              xDataKey="date"
              aspectRatio="4 / 1"
            >
              <Grid />
              <XAxis />
              <YAxis
                numTicks={5}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Line dataKey="overall" stroke="#F97316" />
              {Array.from(visibleSteps).map((stepKey) => (
                <Line
                  key={stepKey}
                  dataKey={`step_${stepKey}`}
                  stroke={STEP_COLORS[Number(stepKey) % STEP_COLORS.length]}
                />
              ))}
              <ChartTooltip
                rows={(point) => {
                  const rows: { color: string; label: string; value: string | number }[] = [
                    { color: '#F97316', label: 'Overall', value: `${point.overall ?? 0}%` },
                  ]
                  for (const stepKey of Array.from(visibleSteps)) {
                    const key = `step_${stepKey}`
                    if (point[key] !== undefined) {
                      rows.push({
                        color: STEP_COLORS[Number(stepKey) % STEP_COLORS.length]!,
                        label: stats?.steps[Number(stepKey)]?.step.name || `Step ${stepKey}`,
                        value: `${point[key]}%`,
                      })
                    }
                  }
                  return rows
                }}
              />
            </LineChart>
          </div>
        )}

        {/* Detailed Stats Table */}
        <div className="glass-surface rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-800/50 border-b border-neutral-800">
                <tr>
                  <th className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider">Step</th>
                  <th className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider text-right">Visitors</th>
                  <th className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider text-right">Drop-off</th>
                  <th className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider text-right">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {stats.steps.map((step, i) => (
                  <React.Fragment key={step.step.name}>
                    <tr className="hover:bg-neutral-800/30 transition-colors cursor-pointer ease-apple" onClick={() => setBreakdownStep(i)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-medium text-neutral-400">
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-medium text-white">{step.step.name}</p>
                            <p className="text-neutral-400 text-xs font-mono mt-0.5">{step.step.value}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-medium text-white">
                          {step.visitors.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {i > 0 ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            step.dropoff > 50
                              ? 'bg-red-900/30 text-red-400'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}>
                            {Math.round(step.dropoff)}%
                          </span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-green-400 font-medium">
                          {Math.round(step.conversion)}%
                        </span>
                      </td>
                    </tr>
                    {step.exit_pages && step.exit_pages.length > 0 && (
                      <tr className="bg-neutral-800/20">
                        <td colSpan={4} className="px-6 py-3">
                          <div className="ml-9">
                            <p className="text-xs font-medium text-neutral-500 mb-2">
                              Where visitors went after dropping off:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {(expandedExitStep === i ? step.exit_pages : step.exit_pages.slice(0, 3)).map(ep => (
                                <span key={ep.path} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-xs">
                                  <span className="font-mono text-neutral-300">{ep.path}</span>
                                  <span className="text-neutral-400">{ep.visitors}</span>
                                </span>
                              ))}
                            </div>
                            {step.exit_pages.length > 3 && (
                              <button
                                type="button"
                                onClick={() => setExpandedExitStep(expandedExitStep === i ? null : i)}
                                className="mt-2 text-xs text-brand-orange hover:underline"
                              >
                                {expandedExitStep === i ? 'Show less' : `See all ${step.exit_pages.length} exit pages`}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {breakdownStep !== null && stats && (
        <BreakdownDrawer
          siteId={siteId}
          funnelId={funnelId}
          stepIndex={breakdownStep}
          stepName={stats.steps[breakdownStep].step.name}
          startDate={dateRange.start}
          endDate={dateRange.end}
          filters={serializeFilters(filters) || undefined}
          onClose={() => setBreakdownStep(null)}
        />
      )}

      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={(range) => {
          setDateRange(range)
          setDatePreset('custom')
          setIsDatePickerOpen(false)
        }}
        initialRange={dateRange}
      />
    </div>
  )
}
