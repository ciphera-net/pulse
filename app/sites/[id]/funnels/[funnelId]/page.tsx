'use client'

import React, { useState, useCallback, useMemo, useEffect } from 'react'
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
import { PencilSimple, FunnelSimple, Warning, ArrowUpRight, ArrowDownRight } from '@phosphor-icons/react'
import { FunnelDetailSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { AnimatedNumber } from '@/components/ui/animated-number'
import Link from 'next/link'
import { FunnelChart } from '@/components/ui/funnel-chart'
import { getDateRange, formatDate, getYesterdayRange, getLast1HourRange, getLast24HoursRange, getThisWeekRange, getThisMonthRange, getThisYearRange } from '@/lib/utils/dateRanges'
import { LineChart, Line, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/line-chart'

const STEP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']
const DAY_MS = 86400000

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function ChangeIndicator({ change, invert }: { change: number | null; invert?: boolean }) {
  if (change === null) return null
  const isPositive = invert ? change < 0 : change > 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
      {change > 0 ? <ArrowUpRight weight="bold" className="size-3" /> : <ArrowDownRight weight="bold" className="size-3" />}
      {Math.abs(change)}%
    </span>
  )
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
  const [expandedChartStep, setExpandedChartStep] = useState<number | null>(null)
  const [hoveredChartStep, setHoveredChartStep] = useState<number | null>(null)

  const filterStr = serializeFilters(filters) || undefined
  const { data: site } = useSite(siteId)
  const { data: funnel, error: funnelError, isLoading: funnelLoading } = useFunnelDetail(siteId, funnelId)
  const { data: stats } = useFunnelStats(siteId, funnelId, dateRange.start, dateRange.end, filterStr)
  const { data: trends } = useFunnelTrends(siteId, funnelId, dateRange.start, dateRange.end, filterStr)

  const prevRange = useMemo((): { start: string; end: string } | null => {
    const startDate = new Date(dateRange.start)
    const endDate = new Date(dateRange.end)
    const duration = endDate.getTime() - startDate.getTime()
    if (duration > 366 * DAY_MS) return null
    const prevEnd = new Date(startDate.getTime() - DAY_MS)
    const prevStart = new Date(prevEnd.getTime() - duration)
    if (prevStart.getFullYear() < 2020) return null
    return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] }
  }, [dateRange])

  const { data: prevStats } = useFunnelStats(siteId, funnelId, prevRange?.start ?? '', prevRange?.end ?? '', filterStr)

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Funnels · ${domain} | Pulse` : 'Funnels | Pulse'
  }, [site?.domain])

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

  const handleChartClick = useCallback(() => {
    if (hoveredChartStep !== null) {
      setExpandedChartStep(prev => prev === hoveredChartStep ? null : hoveredChartStep)
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
    const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1
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

  if (showSkeleton) return <FunnelDetailSkeleton />

  if (funnelError?.status === 404 || (!funnel && !funnelLoading)) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 pt-12">
        <EmptyState icon={<FunnelSimple />} title="Funnel not found" description="This funnel may have been deleted or you don't have access to it." action={{ label: 'Back to Funnels', href: `/sites/${siteId}/funnels` }} />
      </div>
    )
  }

  if (funnelError?.status === 403) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 pt-12">
        <EmptyState icon={<Warning />} title="Access denied" description="You don't have permission to view this funnel." action={{ label: 'Back to Funnels', href: `/sites/${siteId}/funnels` }} />
      </div>
    )
  }

  if (funnelError) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 pt-12">
        <EmptyState icon={<Warning />} title="Unable to load funnel" description="Something went wrong. Please try again." action={{ label: 'Try again', onClick: () => window.location.reload() }} />
      </div>
    )
  }

  if (!funnel) return null

  const chartData = stats?.steps.map(s => ({ label: s.step.name, value: s.visitors })) ?? []
  const totalVisitors = stats?.steps[0]?.visitors ?? 0
  const convertedVisitors = stats?.steps.length ? stats.steps[stats.steps.length - 1].visitors : 0
  const overallConversion = stats?.steps.length ? stats.steps[stats.steps.length - 1].conversion : 0

  const prevTotalVisitors = prevStats?.steps[0]?.visitors ?? 0
  const prevConversion = prevStats?.steps.length ? prevStats.steps[prevStats.steps.length - 1].conversion : 0

  const biggestDropoff = stats?.steps.reduce<{ name: string; dropoff: number } | null>((worst, step, i) => {
    if (i === 0) return worst
    if (!worst || step.dropoff > worst.dropoff) return { name: step.step.name, dropoff: step.dropoff }
    return worst
  }, null)

  const expandedStep = expandedChartStep !== null ? stats?.steps[expandedChartStep] : null
  const hasExitPages = expandedStep?.exit_pages && expandedStep.exit_pages.length > 0

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
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/sites/${siteId}/funnels`} className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors ease-apple">
            <ChevronLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-neutral-200 mb-1">{funnel.name}</h1>
            {funnel.description && <p className="text-sm text-neutral-400">{funnel.description}</p>}
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
          <Link href={`/sites/${siteId}/funnels/${funnelId}/edit`} className="p-2 text-neutral-400 hover:text-brand-orange hover:bg-orange-900/20 rounded-xl transition-colors ease-apple" aria-label="Edit funnel">
            <PencilSimple className="w-5 h-5" />
          </Link>
          <button onClick={() => setDeleteDialogOpen(true)} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-xl transition-colors ease-apple" aria-label="Delete funnel">
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <FilterButton hasActiveFilters={filters.length > 0} onSelectDimension={handleOpenFilterForDimension} />
        <FilterPills filters={filters} onEdit={handleEditFilter} onRemove={handleRemoveFilter} onClear={handleClearFilters} />
      </div>

      {/* Hero Stat Cards */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        >
          <div className="glass-surface rounded-2xl p-5">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-medium text-neutral-400">Conversion</span>
              <ChangeIndicator change={pctChange(overallConversion, prevConversion)} />
            </div>
            <AnimatedNumber value={overallConversion} format={(v: number) => `${Math.round(v)}%`} className="text-2xl font-bold text-white tabular-nums" />
          </div>

          <div className="glass-surface rounded-2xl p-5">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-medium text-neutral-400">Visitors</span>
              <ChangeIndicator change={pctChange(totalVisitors, prevTotalVisitors)} />
            </div>
            <AnimatedNumber value={totalVisitors} format={(v: number) => formatNumber(Math.round(v))} className="text-2xl font-bold text-white tabular-nums" />
          </div>

          <div className="glass-surface rounded-2xl p-5">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-medium text-neutral-400">Converted</span>
            </div>
            <AnimatedNumber value={convertedVisitors} format={(v: number) => formatNumber(Math.round(v))} className="text-2xl font-bold text-white tabular-nums" />
            <p className="text-xs text-neutral-500 mt-1">{totalVisitors > 0 ? `${Math.round(convertedVisitors / totalVisitors * 100)}% of visitors` : ''}</p>
          </div>

          <div className="glass-surface rounded-2xl p-5">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-medium text-neutral-400">Biggest Dropoff</span>
            </div>
            {biggestDropoff ? (
              <>
                <span className="text-2xl font-bold text-red-400 tabular-nums">{Math.round(biggestDropoff.dropoff)}%</span>
                <p className="text-xs text-neutral-500 mt-1 truncate">{biggestDropoff.name}</p>
              </>
            ) : (
              <span className="text-2xl font-bold text-green-400">0%</span>
            )}
          </div>
        </motion.div>
      )}

      {/* Funnel Chart + Inline Exit Pages */}
      {chartData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.05 }}
          className="glass-surface rounded-2xl overflow-hidden mb-6"
        >
          <div className="p-6 cursor-pointer" onClick={handleChartClick}>
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
          </div>

          <AnimatePresence initial={false}>
            {expandedChartStep !== null && expandedStep && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={TIMING}
                className="overflow-hidden"
              >
                <div className="px-6 py-4 border-t border-white/[0.08] bg-neutral-800/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-medium text-neutral-400">{expandedChartStep + 1}</span>
                      <div>
                        <span className="text-sm font-medium text-white">{expandedStep.step.name}</span>
                        <span className="text-xs text-neutral-500 font-mono ml-2">{expandedStep.step.value}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-neutral-400">{formatNumber(expandedStep.visitors)} visitors</span>
                      {expandedChartStep > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          expandedStep.dropoff > 50 ? 'bg-red-900/30 text-red-400' :
                          expandedStep.dropoff > 25 ? 'bg-amber-900/30 text-amber-400' :
                          'bg-neutral-800 text-neutral-300'
                        }`}>{Math.round(expandedStep.dropoff)}% dropoff</span>
                      )}
                    </div>
                  </div>

                  {hasExitPages ? (
                    <div>
                      <p className="text-xs font-medium text-neutral-500 mb-2">Where visitors went after dropping off</p>
                      <div className="space-y-1">
                        {expandedStep.exit_pages!.map(ep => {
                          const maxVisitors = expandedStep.exit_pages![0].visitors
                          const barWidth = maxVisitors > 0 ? (ep.visitors / maxVisitors) * 60 : 0
                          return (
                            <div key={ep.path} className="relative overflow-hidden flex items-center justify-between h-7 rounded-md px-2 -mx-2">
                              <div className="absolute inset-y-0.5 left-0.5 bg-neutral-700/40 rounded-md transition-[width] ease-apple" style={{ width: `${barWidth}%` }} />
                              <span className="relative text-xs font-mono text-neutral-300 truncate">{ep.path}</span>
                              <span className="relative text-xs font-medium text-neutral-500 ml-4 tabular-nums">{formatNumber(ep.visitors)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : expandedChartStep === 0 ? (
                    <p className="text-xs text-neutral-500">This is the entry step — all visitors start here.</p>
                  ) : (
                    <p className="text-xs text-neutral-500">No exit page data for this step.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {stats && chartData.length === 0 && (
        <EmptyState icon={<FunnelSimple />} title="No data yet" description="No visitors have entered this funnel in the selected date range." />
      )}

      {/* Conversion Trends */}
      {trends && trends.dates.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.1 }}
          className="glass-surface rounded-2xl overflow-hidden p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Conversion Trends</h3>
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
              <Line key={stepKey} dataKey={`step_${stepKey}`} stroke={STEP_COLORS[Number(stepKey) % STEP_COLORS.length]} />
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete funnel</DialogTitle>
            <DialogDescription>Are you sure you want to delete &ldquo;{funnel.name}&rdquo;? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeleteDialogOpen(false)} className="glass-surface rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors ease-apple">Cancel</button>
            <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors ease-apple">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DatePicker isOpen={isDatePickerOpen} onClose={() => setIsDatePickerOpen(false)} onApply={(range) => { setDateRange(range); setDatePreset('custom'); setIsDatePickerOpen(false) }} initialRange={dateRange} />
      <FilterModal open={isFilterModalOpen} initialDimension={filterModalDimension} initialFilter={editingFilterIndex !== null ? filters[editingFilterIndex] : null} onSave={handleFilterModalSave} onClose={handleFilterModalClose} />
    </div>
  )
}
