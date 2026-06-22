'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE, TIMING } from '@/lib/motion'
import { deleteFunnel, createFunnel, updateFunnel, type Funnel, type FunnelStats, type CreateFunnelRequest } from '@/lib/api/funnels'
import { useSite, useFunnels, useFunnelStats } from '@/lib/swr/dashboard'
import { toast, PlusIcon, ArrowRightIcon, TrashIcon, Button } from '@ciphera-net/facet'
import { formatNumber } from '@/lib/utils/format'
import { FunnelsListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { FunnelSimple, PencilSimple } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import FunnelModal from '@/components/funnels/FunnelModal'
import { getDateRange, formatDate } from '@/lib/utils/dateRanges'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useCan } from '@/lib/auth/permissions'
import { pctChange, type PctChangeResult } from '@/lib/utils/pctChange'
const DAY_MS = 86400000

function formatConvertTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function ChangeIndicator({ change }: { change: PctChangeResult }) {
  if (!change) return null
  if (change.type === 'new') return (
    <span className="text-[10px] font-medium text-brand-orange bg-brand-orange/10 px-1.5 py-0.5 rounded-none">New</span>
  )
  const isPositive = change.value > 0
  return (
    <span className={`text-[10px] font-medium flex items-center gap-0.5 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      {isPositive ? '↑' : '↓'} {Math.abs(change.value)}%
    </span>
  )
}

function FunnelCard({ funnel, siteId, dateRange, onDelete, onEdit, canManage }: {
  funnel: Funnel
  siteId: string
  dateRange: { start: string; end: string }
  onDelete: (funnel: { id: string; name: string }) => void
  onEdit: (funnel: Funnel) => void
  canManage: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  const { data: stats } = useFunnelStats(siteId, funnel.id, dateRange.start, dateRange.end)

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

  return (
    <div className="glass-surface rounded-none overflow-hidden transition-colors ease-apple">
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
                <span className="text-sm font-medium tabular-nums text-green-400">{Math.round(overallConversion)}%</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {funnel.steps.map((step, i) => (
                <div key={step.name} className="flex items-center text-sm text-neutral-500">
                  <span className="px-2 py-0.5 bg-neutral-800 rounded-none text-xs text-neutral-300">{step.name}</span>
                  {i < funnel.steps.length - 1 && <ArrowRightIcon className="w-3.5 h-3.5 mx-1.5 text-neutral-600" />}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {canManage && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(funnel) }}
                  className="p-2 text-neutral-400 hover:text-brand-orange hover:bg-orange-900/20 rounded-none transition-colors ease-apple"
                  aria-label="Edit funnel"
                >
                  <PencilSimple className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete({ id: funnel.id, name: funnel.name }) }}
                  className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-none transition-colors ease-apple"
                  aria-label="Delete funnel"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
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
            <div className="border-t border-neutral-800/60">
              {/* Stat cards */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5">
                  <div className="bg-neutral-800/30 border border-neutral-800/60 rounded-none p-4">
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-medium text-neutral-500">Conversion</span>
                      <ChangeIndicator change={pctChange(overallConversion, prevConversion)} />
                    </div>
                    <AnimatedNumber value={overallConversion} format={(v: number) => `${Math.round(v)}%`} className="text-xl font-bold text-white tabular-nums" />
                  </div>
                  <div className="bg-neutral-800/30 border border-neutral-800/60 rounded-none p-4">
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-medium text-neutral-500">Visitors</span>
                      <ChangeIndicator change={pctChange(totalVisitors, prevTotalVisitors)} />
                    </div>
                    <AnimatedNumber value={totalVisitors} format={(v: number) => formatNumber(Math.round(v))} className="text-xl font-bold text-white tabular-nums" />
                  </div>
                  <div className="bg-neutral-800/30 border border-neutral-800/60 rounded-none p-4">
                    <span className="text-xs font-medium text-neutral-500 block mb-1.5">Converted</span>
                    <AnimatedNumber value={convertedVisitors} format={(v: number) => formatNumber(Math.round(v))} className="text-xl font-bold text-white tabular-nums" />
                  </div>
                  <div className="bg-neutral-800/30 border border-neutral-800/60 rounded-none p-4">
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
                  <div className="bg-neutral-800/30 border border-neutral-800/60 rounded-none p-4">
                    <span className="text-xs font-medium text-neutral-500 block mb-1.5">Median Time</span>
                    <span className="text-xl font-bold text-white tabular-nums">
                      {stats.median_convert_seconds != null
                        ? formatConvertTime(stats.median_convert_seconds)
                        : '—'}
                    </span>
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
                            <span className="w-5 h-5 rounded-none bg-neutral-800 flex items-center justify-center text-[10px] font-medium text-neutral-400 flex-shrink-0">{i + 1}</span>
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
                              {step.median_step_seconds != null && i > 0 && (
                                <p className="text-xs text-neutral-500 mt-0.5">~{formatConvertTime(step.median_step_seconds)}</p>
                              )}
                            </div>
                            <div className="flex-1 flex items-center gap-3">
                              <div className="flex-1 h-6 bg-neutral-800/50 rounded-none overflow-hidden">
                                <motion.div
                                  className="h-full bg-[#10B981] rounded-none"
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
                                          <div key={ep.path} className="relative overflow-hidden flex items-center justify-between h-7 rounded-none px-2 -mx-2">
                                            <div className="absolute inset-y-0.5 left-0.5 bg-neutral-700/40 rounded-none" style={{ width: `${epBar}%` }} />
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
  const canManageFunnels = useCan('funnels.manage')

  const { data: site } = useSite(siteId)
  const { data: funnels = [], isLoading, mutate } = useFunnels(siteId)
  const [deletingFunnel, setDeletingFunnel] = useState<{ id: string; name: string } | null>(null)
  const [dateRange, setDateRange] = useState(() => getDateRange(30))
  const [period, setPeriod] = useState('30')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFunnel, setEditingFunnel] = useState<Funnel | null>(null)

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
    setPeriod('custom')
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
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">Funnels</h1>
          <p className="text-sm text-neutral-400">Track user journeys and identify drop-off points</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            period={period}
            dateRange={dateRange}
            onPeriodChange={setPeriod}
            onDateRangeChange={setDateRange}
            onShift={shiftPeriod}
          />
          {canManageFunnels && (
            <Button variant="default" onClick={() => { setEditingFunnel(null); setModalOpen(true) }}>
              <PlusIcon className="w-4 h-4" />
              Create Funnel
            </Button>
          )}
        </div>
      </div>

      {funnels.length === 0 ? (
        <EmptyState
          icon={<FunnelSimple />}
          title="No funnels yet"
          description="Create a funnel to track how visitors move through your site and where they drop off."
          action={canManageFunnels ? { label: 'Create funnel', onClick: () => { setEditingFunnel(null); setModalOpen(true) } } : undefined}
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
              <FunnelCard funnel={funnel} siteId={siteId} dateRange={dateRange} onDelete={setDeletingFunnel} onEdit={(f) => { setEditingFunnel(f); setModalOpen(true) }} canManage={canManageFunnels} />
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
            <Button variant="secondary" onClick={() => setDeletingFunnel(null)}>Cancel</Button>
            <Button variant="default" className="bg-red-600 hover:bg-red-500 shadow-none" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modalOpen && canManageFunnels && (
        <FunnelModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setEditingFunnel(null) }}
          initialData={editingFunnel ?? undefined}
          onSubmit={async (data: CreateFunnelRequest) => {
            if (editingFunnel) {
              await updateFunnel(siteId, editingFunnel.id, data)
              toast.success('Funnel updated')
            } else {
              await createFunnel(siteId, data)
              toast.success('Funnel created')
            }
            mutate()
          }}
        />
      )}
    </div>
  )
}
