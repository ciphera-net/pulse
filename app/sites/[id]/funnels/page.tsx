'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE, TIMING } from '@/lib/motion'
import { deleteFunnel, type Funnel, type FunnelStats, type FunnelTrends } from '@/lib/api/funnels'
import { useSite, useFunnels, useFunnelStats, useFunnelTrends } from '@/lib/swr/dashboard'
import { toast, PlusIcon, ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, Button, formatNumber, Select, DatePicker } from '@ciphera-net/ui'
import { FunnelsListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { FunnelSimple, PencilSimple, ArrowUpRight, ArrowDownRight } from '@phosphor-icons/react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { getDateRange, formatDate, getYesterdayRange, getLast1HourRange, getLast24HoursRange, getThisWeekRange, getThisMonthRange, getThisYearRange } from '@/lib/utils/dateRanges'
import { LineChart, Line, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/line-chart'

const STEP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']
const DAY_MS = 86400000

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) return null
  const isPositive = change > 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
      {change > 0 ? <ArrowUpRight weight="bold" className="size-3" /> : <ArrowDownRight weight="bold" className="size-3" />}
      {Math.abs(change)}%
    </span>
  )
}

function FunnelCard({ funnel, siteId, dateRange, onDelete }: {
  funnel: Funnel
  siteId: string
  dateRange: { start: string; end: string }
  onDelete: (funnel: { id: string; name: string }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [visibleSteps, setVisibleSteps] = useState<Set<string>>(new Set())

  const { data: stats } = useFunnelStats(siteId, funnel.id, expanded ? dateRange.start : '', expanded ? dateRange.end : '')

  const prevRange = useMemo((): { start: string; end: string } | null => {
    if (!expanded) return null
    const s = new Date(dateRange.start)
    const e = new Date(dateRange.end)
    const duration = e.getTime() - s.getTime()
    if (duration > 366 * DAY_MS) return null
    const prevEnd = new Date(s.getTime() - DAY_MS)
    const prevStart = new Date(prevEnd.getTime() - duration)
    if (prevStart.getFullYear() < 2020) return null
    return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] }
  }, [dateRange, expanded])

  const { data: prevStats } = useFunnelStats(siteId, funnel.id, prevRange?.start ?? '', prevRange?.end ?? '')
  const { data: trends } = useFunnelTrends(siteId, funnel.id, expanded ? dateRange.start : '', expanded ? dateRange.end : '')

  const totalVisitors = stats?.steps[0]?.visitors ?? 0
  const convertedVisitors = stats?.steps.length ? stats.steps[stats.steps.length - 1].visitors : 0
  const overallConversion = stats?.steps.length ? stats.steps[stats.steps.length - 1].conversion : 0
  const prevConversion = prevStats?.steps.length ? prevStats.steps[prevStats.steps.length - 1].conversion : 0
  const prevTotalVisitors = prevStats?.steps[0]?.visitors ?? 0

  const biggestDropoff = stats?.steps.reduce<{ name: string; dropoff: number } | null>((worst, step, i) => {
    if (i === 0) return worst
    if (!worst || step.dropoff > worst.dropoff) return { name: step.step.name, dropoff: step.dropoff }
    return worst
  }, null)

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
    <div className="glass-surface rounded-2xl overflow-hidden transition-colors ease-apple">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full text-left p-6 hover:bg-white/[0.02] transition-colors ease-apple"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-white">{funnel.name}</h3>
              {stats && (
                <span className={`text-sm font-medium tabular-nums ${
                  overallConversion >= 50 ? 'text-green-400' : overallConversion >= 20 ? 'text-amber-400' : 'text-red-400'
                }`}>{Math.round(overallConversion)}%</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {funnel.steps.map((step, i) => (
                <div key={step.name} className="flex items-center text-sm text-neutral-500">
                  <span className="px-2 py-0.5 bg-neutral-800 rounded-lg text-xs text-neutral-300">{step.name}</span>
                  {i < funnel.steps.length - 1 && <ArrowRightIcon className="w-3.5 h-3.5 mx-1.5 text-neutral-600" />}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Link
              href={`/sites/${siteId}/funnels/${funnel.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="p-2 text-neutral-400 hover:text-brand-orange hover:bg-orange-900/20 rounded-xl transition-colors ease-apple"
              aria-label="Edit funnel"
            >
              <PencilSimple className="w-4 h-4" />
            </Link>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete({ id: funnel.id, name: funnel.name }) }}
              className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-xl transition-colors ease-apple"
              aria-label="Delete funnel"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
            <svg className={`w-4 h-4 text-neutral-500 transition-transform duration-base ${expanded ? 'rotate-180' : ''} ease-apple`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={TIMING}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06]">
              {/* Stat cards */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
                  <div className="bg-neutral-800/30 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-medium text-neutral-500">Conversion</span>
                      <ChangeIndicator change={pctChange(overallConversion, prevConversion)} />
                    </div>
                    <AnimatedNumber value={overallConversion} format={(v: number) => `${Math.round(v)}%`} className="text-xl font-bold text-white tabular-nums" />
                  </div>
                  <div className="bg-neutral-800/30 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-medium text-neutral-500">Visitors</span>
                      <ChangeIndicator change={pctChange(totalVisitors, prevTotalVisitors)} />
                    </div>
                    <AnimatedNumber value={totalVisitors} format={(v: number) => formatNumber(Math.round(v))} className="text-xl font-bold text-white tabular-nums" />
                  </div>
                  <div className="bg-neutral-800/30 rounded-xl p-4">
                    <span className="text-xs font-medium text-neutral-500 block mb-1.5">Converted</span>
                    <AnimatedNumber value={convertedVisitors} format={(v: number) => formatNumber(Math.round(v))} className="text-xl font-bold text-white tabular-nums" />
                  </div>
                  <div className="bg-neutral-800/30 rounded-xl p-4">
                    <span className="text-xs font-medium text-neutral-500 block mb-1.5">Biggest Dropoff</span>
                    {biggestDropoff ? (
                      <>
                        <span className="text-xl font-bold text-red-400 tabular-nums">{Math.round(biggestDropoff.dropoff)}%</span>
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">{biggestDropoff.name}</p>
                      </>
                    ) : (
                      <span className="text-xl font-bold text-green-400">0%</span>
                    )}
                  </div>
                </div>
              )}

              {/* Step breakdown */}
              {stats && stats.steps.length > 0 && (
                <div className="divide-y divide-white/[0.04]">
                  {stats.steps.map((step, i) => {
                    const isStepExpanded = expandedStep === i
                    const barWidth = totalVisitors > 0 ? (step.visitors / totalVisitors) * 100 : 0
                    const dropped = i > 0 ? stats.steps[i - 1].visitors - step.visitors : 0
                    const stepExitPages = step.exit_pages && step.exit_pages.length > 0

                    return (
                      <div key={step.step.name}>
                        <button
                          type="button"
                          onClick={() => setExpandedStep(prev => prev === i ? null : i)}
                          className="w-full text-left px-5 py-3 hover:bg-white/[0.02] transition-colors ease-apple"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-medium text-neutral-400 flex-shrink-0">{i + 1}</span>
                            <span className="text-xs text-neutral-500 uppercase tracking-wider">{step.step.category === 'event' ? 'Event' : 'Page'}</span>
                            <span className="text-sm font-medium text-white truncate">{step.step.value}</span>
                            <svg className={`w-3 h-3 text-neutral-600 flex-shrink-0 ml-auto transition-transform duration-base ${isStepExpanded ? 'rotate-90' : ''} ease-apple`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="flex items-center gap-4 ml-8">
                            <div className="w-28 flex-shrink-0">
                              <span className="text-base font-semibold text-white tabular-nums">{formatNumber(step.visitors)}</span>
                              <span className="text-xs text-neutral-500 ml-1">sessions</span>
                              {dropped > 0 && <p className="text-xs text-red-400 mt-0.5">{formatNumber(dropped)} dropped</p>}
                            </div>
                            <div className="flex-1 flex items-center gap-3">
                              <div className="flex-1 h-6 bg-neutral-800/50 rounded overflow-hidden">
                                <motion.div
                                  className="h-full bg-[#10B981] rounded"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${barWidth}%` }}
                                  transition={{ duration: 0.6, ease: EASE_APPLE, delay: i * 0.08 }}
                                />
                              </div>
                              <span className="text-sm font-medium text-neutral-300 tabular-nums w-12 text-right">{Math.round(step.conversion)}%</span>
                            </div>
                          </div>
                        </button>

                        <AnimatePresence initial={false}>
                          {isStepExpanded && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={TIMING} className="overflow-hidden">
                              <div className="px-5 pb-3 ml-8">
                                {stepExitPages ? (
                                  <div>
                                    <p className="text-xs font-medium text-neutral-500 mb-2">Where visitors went after dropping off</p>
                                    <div className="space-y-1">
                                      {step.exit_pages!.map(ep => {
                                        const maxEp = step.exit_pages![0].visitors
                                        const epBar = maxEp > 0 ? (ep.visitors / maxEp) * 60 : 0
                                        return (
                                          <div key={ep.path} className="relative overflow-hidden flex items-center justify-between h-7 rounded-md px-2 -mx-2">
                                            <div className="absolute inset-y-0.5 left-0.5 bg-neutral-700/40 rounded-md" style={{ width: `${epBar}%` }} />
                                            <span className="relative text-xs font-mono text-neutral-300 truncate">{ep.path}</span>
                                            <span className="relative text-xs font-medium text-neutral-500 ml-4 tabular-nums">{formatNumber(ep.visitors)}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : i === 0 ? (
                                  <p className="text-xs text-neutral-500">Entry step — all visitors start here.</p>
                                ) : (
                                  <p className="text-xs text-neutral-500">No exit page data for this step.</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Conversion Trends — only show when there's meaningful data */}
              {trends && trends.dates.length > 1 && trends.overall.some(v => v > 0) && (
                <div className="p-5 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Conversion Trends</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {stats?.steps.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setVisibleSteps(prev => { const next = new Set(prev); if (next.has(String(i))) next.delete(String(i)); else next.add(String(i)); return next })}
                          className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                            visibleSteps.has(String(i)) ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/30' : 'bg-neutral-800 text-neutral-500 border border-transparent'
                          } ease-apple`}
                        >
                          {s.step.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <LineChart data={trendsChartData} xDataKey="date" aspectRatio="5 / 1">
                    <Grid />
                    <XAxis />
                    <YAxis numTicks={4} formatValue={(v) => `${Math.round(v)}%`} />
                    <Line dataKey="overall" stroke="#FD5E0F" />
                    {Array.from(visibleSteps).map((stepKey) => (
                      <Line key={stepKey} dataKey={`step_${stepKey}`} stroke={STEP_COLORS[Number(stepKey) % STEP_COLORS.length]} />
                    ))}
                    <ChartTooltip
                      rows={(point) => {
                        const rows: { color: string; label: string; value: string | number }[] = [
                          { color: '#FD5E0F', label: 'Overall', value: `${point.overall ?? 0}%` },
                        ]
                        for (const stepKey of Array.from(visibleSteps)) {
                          const key = `step_${stepKey}`
                          if (point[key] !== undefined) {
                            rows.push({ color: STEP_COLORS[Number(stepKey) % STEP_COLORS.length]!, label: stats?.steps[Number(stepKey)]?.step.name || `Step ${stepKey}`, value: `${point[key]}%` })
                          }
                        }
                        return rows
                      }}
                    />
                  </LineChart>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FunnelsPage() {
  const params = useParams()
  const siteId = params.id as string

  const { data: site } = useSite(siteId)
  const { data: funnels = [], isLoading, mutate } = useFunnels(siteId)
  const [deletingFunnel, setDeletingFunnel] = useState<{ id: string; name: string } | null>(null)
  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [datePreset, setDatePreset] = useState<'1h' | '24h' | 'today' | 'yesterday' | '7' | '30' | 'week' | 'month' | 'year' | 'custom'>('30')
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Funnels · ${domain} | Pulse` : 'Funnels | Pulse'
  }, [site?.domain])

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

  const handleDelete = async () => {
    if (!deletingFunnel) return
    try {
      await deleteFunnel(siteId, deletingFunnel.id)
      toast.success('Funnel deleted')
      setDeletingFunnel(null)
      mutate()
    } catch {
      toast.error('Failed to delete funnel')
    }
  }

  const showSkeleton = useMinimumLoading(isLoading && !funnels.length)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) return <FunnelsListSkeleton />

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">Funnels</h1>
          <p className="text-sm text-neutral-400">Track user journeys and identify drop-off points</p>
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
          <Link href={`/sites/${siteId}/funnels/new`}>
            <Button variant="primary" className="inline-flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              <span>Create Funnel</span>
            </Button>
          </Link>
        </div>
      </div>

      {funnels.length === 0 ? (
        <EmptyState
          icon={<FunnelSimple />}
          title="No funnels yet"
          description="Create a funnel to track how visitors move through your site and where they drop off."
          action={{ label: 'Create funnel', href: `/sites/${siteId}/funnels/new` }}
        />
      ) : (
        <div className="grid gap-4">
          {funnels.map((funnel, index) => (
            <motion.div
              key={funnel.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: index * 0.05 }}
            >
              <FunnelCard funnel={funnel} siteId={siteId} dateRange={dateRange} onDelete={setDeletingFunnel} />
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!deletingFunnel} onOpenChange={() => setDeletingFunnel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete funnel</DialogTitle>
            <DialogDescription>Are you sure you want to delete &ldquo;{deletingFunnel?.name}&rdquo;? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeletingFunnel(null)} className="glass-surface rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors ease-apple">Cancel</button>
            <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors ease-apple">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DatePicker isOpen={isDatePickerOpen} onClose={() => setIsDatePickerOpen(false)} onApply={(range) => { setDateRange(range); setDatePreset('custom'); setIsDatePickerOpen(false) }} initialRange={dateRange} />
    </div>
  )
}
