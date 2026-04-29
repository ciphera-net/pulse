'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE, TIMING } from '@/lib/motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useParams, useRouter } from 'next/navigation'
import { deleteFunnel } from '@/lib/api/funnels'
import { useSite, useFunnelDetail, useFunnelStats, useFunnelTrends } from '@/lib/swr/dashboard'
import FilterButton from '@/components/dashboard/FilterButton'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterModal from '@/components/dashboard/FilterModal'
import { type DimensionFilter, serializeFilters } from '@/lib/filters'
import { toast, Select, DatePicker, ChevronLeftIcon, ChevronRightIcon, TrashIcon, Button, formatNumber } from '@ciphera-net/ui'
import { PencilSimple, FunnelSimple, Warning } from '@phosphor-icons/react'
import { FunnelDetailSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'
import { FunnelChart } from '@/components/ui/funnel-chart'
import { getDateRange, formatDate, getYesterdayRange, getLast1HourRange, getLast24HoursRange, getThisWeekRange, getThisMonthRange, getThisYearRange } from '@/lib/utils/dateRanges'
import { LineChart, Line, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/line-chart'

const STEP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

function conversionColor(rate: number, isFirst: boolean): string {
  if (isFirst) return 'text-white'
  if (rate >= 50) return 'text-green-400'
  if (rate >= 20) return 'text-amber-400'
  return 'text-red-400'
}

function dropoffColor(rate: number): string {
  if (rate > 50) return 'bg-red-900/30 text-red-400'
  if (rate > 25) return 'bg-amber-900/30 text-amber-400'
  return 'bg-neutral-800 text-neutral-300'
}

export default function FunnelReportPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string
  const funnelId = params.funnelId as string

  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [datePreset, setDatePreset] = useState<'1h' | '24h' | 'today' | 'yesterday' | '7' | '30' | 'week' | 'month' | 'year' | 'custom'>('30')
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [filters, setFilters] = useState<DimensionFilter[]>([])
  const [editingFilterIndex, setEditingFilterIndex] = useState<number | null>(null)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [filterModalDimension, setFilterModalDimension] = useState<string | null>(null)
  const [visibleSteps, setVisibleSteps] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [hoveredChartStep, setHoveredChartStep] = useState<number | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const { data: site } = useSite(siteId)

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Funnels · ${domain} | Pulse` : 'Funnels | Pulse'
  }, [site?.domain])

  const filterStr = serializeFilters(filters) || undefined
  const { data: funnel, error: funnelError, isLoading: funnelLoading } = useFunnelDetail(siteId, funnelId)
  const { data: stats } = useFunnelStats(siteId, funnelId, dateRange.start, dateRange.end, filterStr)
  const { data: trends } = useFunnelTrends(siteId, funnelId, dateRange.start, dateRange.end, filterStr)

  const handleDelete = async () => {
    try {
      await deleteFunnel(siteId, funnelId)
      toast.success('Funnel deleted')
      setDeleteDialogOpen(false)
      router.push(`/sites/${siteId}/funnels`)
    } catch {
      toast.error('Failed to delete funnel')
    }
  }

  const toggleStep = useCallback((index: number) => {
    setExpandedStep(prev => prev === index ? null : index)
  }, [])

  const handleChartClick = useCallback(() => {
    if (hoveredChartStep !== null) {
      setExpandedStep(prev => prev === hoveredChartStep ? null : hoveredChartStep)
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [hoveredChartStep])

  const handleOpenFilterForDimension = useCallback((dimension: string) => {
    setFilterModalDimension(dimension)
    setEditingFilterIndex(null)
    setIsFilterModalOpen(true)
  }, [])

  const handleEditFilter = useCallback((index: number) => {
    setEditingFilterIndex(index)
    setFilterModalDimension(filters[index]?.dimension || null)
    setIsFilterModalOpen(true)
  }, [filters])

  const handleRemoveFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilters([])
  }, [])

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
    setDatePreset('custom')
  }, [dateRange])

  const handleFilterModalSave = useCallback((filter: DimensionFilter) => {
    if (editingFilterIndex !== null) {
      setFilters(prev => prev.map((f, i) => i === editingFilterIndex ? filter : f))
    } else {
      setFilters(prev => [...prev, filter])
    }
    setIsFilterModalOpen(false)
    setEditingFilterIndex(null)
  }, [editingFilterIndex])

  const handleFilterModalClose = useCallback(() => {
    setIsFilterModalOpen(false)
    setEditingFilterIndex(null)
  }, [])

  const showSkeleton = useMinimumLoading(funnelLoading && !funnel)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) {
    return <FunnelDetailSkeleton />
  }

  if (funnelError?.status === 404 || (!funnel && !funnelLoading)) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 pt-12">
        <EmptyState
          icon={<FunnelSimple />}
          title="Funnel not found"
          description="This funnel may have been deleted or you don't have access to it."
          action={{ label: 'Back to Funnels', href: `/sites/${siteId}/funnels` }}
        />
      </div>
    )
  }

  if (funnelError?.status === 403) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 pt-12">
        <EmptyState
          icon={<Warning />}
          title="Access denied"
          description="You don't have permission to view this funnel."
          action={{ label: 'Back to Funnels', href: `/sites/${siteId}/funnels` }}
        />
      </div>
    )
  }

  if (funnelError) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 pt-12">
        <EmptyState
          icon={<Warning />}
          title="Unable to load funnel"
          description="Something went wrong. Please try again."
          action={{ label: 'Try again', onClick: () => window.location.reload() }}
        />
      </div>
    )
  }

  if (!funnel) return null

  const chartData = stats?.steps.map(s => ({
    label: s.step.name,
    value: s.visitors,
  })) ?? []

  const overallConversion = stats?.steps.length
    ? stats.steps[stats.steps.length - 1].conversion
    : 0

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href={`/sites/${siteId}/funnels`}
              className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors ease-apple"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-neutral-200">
                  {funnel.name}
                </h1>
                {stats && (
                  <span className={`text-sm font-medium ${conversionColor(overallConversion, false)}`}>
                    {Math.round(overallConversion)}% conversion
                  </span>
                )}
              </div>
              {funnel.description && (
                <p className="text-sm text-neutral-400">
                  {funnel.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center h-10 rounded-lg border border-white/[0.08] bg-neutral-900/80 shadow-sm">
              <button onClick={() => shiftPeriod(-1)} className="px-2 h-full text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors rounded-l-lg ease-apple" aria-label="Previous period">
                <ChevronLeftIcon className="w-4 h-4" weight="bold" />
              </button>
              <div className="w-px h-5 bg-white/[0.08]" />
              <Select
                variant="ghost"
                className="min-w-[130px]"
                value={datePreset}
                onChange={(value) => {
                  if (value === 'today') { setDateRange({ start: formatDate(new Date()), end: formatDate(new Date()) }); setDatePreset('today') }
                  else if (value === 'yesterday') { setDateRange(getYesterdayRange()); setDatePreset('yesterday') }
                  else if (value === '1h') { setDateRange(getLast1HourRange()); setDatePreset('1h') }
                  else if (value === '24h') { setDateRange(getLast24HoursRange()); setDatePreset('24h') }
                  else if (value === '7') { setDateRange(getDateRange(7)); setDatePreset('7') }
                  else if (value === '30') { setDateRange(getDateRange(30)); setDatePreset('30') }
                  else if (value === 'week') { setDateRange(getThisWeekRange()); setDatePreset('week') }
                  else if (value === 'month') { setDateRange(getThisMonthRange()); setDatePreset('month') }
                  else if (value === 'year') { setDateRange(getThisYearRange()); setDatePreset('year') }
                  else if (value === 'custom') { setIsDatePickerOpen(true) }
                }}
                options={[
                  { value: '1h', label: 'Last 1 hour' },
                  { value: '24h', label: 'Last 24 hours' },
                  { value: 'divider-0', label: '', divider: true },
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: '7', label: 'Last 7 days' },
                  { value: '30', label: 'Last 30 days' },
                  { value: 'divider-1', label: '', divider: true },
                  { value: 'week', label: 'This week' },
                  { value: 'month', label: 'This month' },
                  { value: 'year', label: 'This year' },
                  { value: 'divider-2', label: '', divider: true },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
              <div className="w-px h-5 bg-white/[0.08]" />
              <button onClick={() => shiftPeriod(1)} className="px-2 h-full text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors rounded-r-lg ease-apple" aria-label="Next period">
                <ChevronRightIcon className="w-4 h-4" weight="bold" />
              </button>
            </div>

            <Link
              href={`/sites/${siteId}/funnels/${funnelId}/edit`}
              className="p-2 text-neutral-400 hover:text-brand-orange hover:bg-orange-900/20 rounded-xl transition-colors ease-apple"
              aria-label="Edit funnel"
            >
              <PencilSimple className="w-5 h-5" />
            </Link>
            <button
              onClick={() => setDeleteDialogOpen(true)}
              className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-xl transition-colors ease-apple"
              aria-label="Delete funnel"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <FilterButton hasActiveFilters={filters.length > 0} onSelectDimension={handleOpenFilterForDimension} />
          <FilterPills filters={filters} onEdit={handleEditFilter} onRemove={handleRemoveFilter} onClear={handleClearFilters} />
        </div>

        {/* Funnel Chart */}
        {chartData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
            className="glass-surface rounded-2xl overflow-hidden p-6 mb-6 cursor-pointer"
            onClick={handleChartClick}
          >
            <FunnelChart
              data={chartData}
              orientation="horizontal"
              color="var(--chart-1)"
              layers={3}
              labelLayout="grouped"
              labelAlign="center"
              labelOrientation="vertical"
              style={{ aspectRatio: '4 / 1' }}
              onHoverChange={setHoveredChartStep}
            />
          </motion.div>
        )}

        {/* Conversion Trends */}
        {trends && trends.dates.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.05 }}
            className="glass-surface rounded-2xl overflow-hidden p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
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

            <LineChart data={trendsChartData} xDataKey="date" aspectRatio="4 / 1">
              <Grid />
              <XAxis />
              <YAxis numTicks={5} formatValue={(v) => `${Math.round(v)}%`} />
              <Line dataKey="overall" stroke="var(--brand-orange)" />
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
                    { color: 'var(--brand-orange)', label: 'Overall', value: `${point.overall ?? 0}%` },
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
          </motion.div>
        )}

        {/* Stats Table */}
        {stats && stats.steps.length > 0 ? (
          <motion.div
            ref={tableRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.1 }}
            className="glass-surface rounded-2xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-800/50 border-b border-neutral-800">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider text-xs">Step</th>
                    <th scope="col" className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider text-xs text-right">Visitors</th>
                    <th scope="col" className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider text-xs text-right">Drop-off</th>
                    <th scope="col" className="px-6 py-4 font-medium text-neutral-400 uppercase tracking-wider text-xs text-right">Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {stats.steps.map((step, i) => {
                    const isExpanded = expandedStep === i
                    const hasExitPages = step.exit_pages && step.exit_pages.length > 0

                    return (
                      <React.Fragment key={step.step.name}>
                        <tr
                          onClick={() => toggleStep(i)}
                          className="hover:bg-neutral-800/30 transition-colors cursor-pointer ease-apple group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-medium text-neutral-400">
                                {i + 1}
                              </span>
                              <svg
                                className={`w-3.5 h-3.5 text-neutral-500 flex-shrink-0 transition-transform duration-base ${isExpanded ? 'rotate-90' : ''} ease-apple`}
                                fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <div>
                                <p className="font-medium text-white">{step.step.name}</p>
                                <p className="text-neutral-500 text-xs font-mono mt-0.5">{step.step.value}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-medium text-white">
                              {formatNumber(step.visitors)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {i > 0 ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${dropoffColor(step.dropoff)}`}>
                                {Math.round(step.dropoff)}%
                              </span>
                            ) : (
                              <span className="text-neutral-600">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={`font-medium ${conversionColor(step.conversion, i === 0)}`}>
                              {Math.round(step.conversion)}%
                            </span>
                          </td>
                        </tr>

                        {/* Inline expansion — exit pages */}
                        <tr>
                          <td colSpan={4} className="p-0">
                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={TIMING}
                                  className="overflow-hidden"
                                >
                                  <div className="px-6 py-4 bg-neutral-800/20 border-t border-neutral-800/50">
                                    {hasExitPages ? (
                                      <div className="ml-9">
                                        <p className="text-xs font-medium text-neutral-500 mb-3">
                                          Where visitors went after dropping off
                                        </p>
                                        <div className="space-y-1.5">
                                          {step.exit_pages!.map(ep => {
                                            const maxVisitors = step.exit_pages![0].visitors
                                            const barWidth = maxVisitors > 0 ? (ep.visitors / maxVisitors) * 60 : 0
                                            return (
                                              <div key={ep.path} className="relative overflow-hidden flex items-center justify-between h-7 rounded-md px-2 -mx-2">
                                                <div
                                                  className="absolute inset-y-0.5 left-0.5 bg-neutral-700/40 rounded-md transition-[width] ease-apple"
                                                  style={{ width: `${barWidth}%` }}
                                                />
                                                <span className="relative text-xs font-mono text-neutral-300 truncate">{ep.path}</span>
                                                <span className="relative text-xs font-medium text-neutral-500 ml-4 tabular-nums">{formatNumber(ep.visitors)}</span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    ) : i === 0 ? (
                                      <p className="text-xs text-neutral-500 ml-9">This is the entry step — all visitors start here.</p>
                                    ) : (
                                      <p className="text-xs text-neutral-500 ml-9">No exit page data for this step.</p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : stats && stats.steps.length === 0 ? (
          <EmptyState
            icon={<FunnelSimple />}
            title="No data yet"
            description="No visitors have entered this funnel in the selected date range."
          />
        ) : null}
      </div>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete funnel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{funnel.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeleteDialogOpen(false)} className="glass-surface rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors ease-apple">
              Cancel
            </button>
            <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors ease-apple">
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <FilterModal
        open={isFilterModalOpen}
        initialDimension={filterModalDimension}
        initialFilter={editingFilterIndex !== null ? filters[editingFilterIndex] : null}
        onSave={handleFilterModalSave}
        onClose={handleFilterModalClose}
      />
    </div>
  )
}
