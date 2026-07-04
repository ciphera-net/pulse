'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, FunnelSimple } from '@phosphor-icons/react'
import { toast, Button } from '@ciphera-net/facet'
import { updateFunnel, deleteFunnel, type CreateFunnelRequest } from '@/lib/api/funnels'
import { ApiError } from '@/lib/api/client'
import { useFunnelDetail, useFunnelStats } from '@/lib/swr/dashboard'
import { useFunnelDateRange, type Period } from '@/lib/hooks/useFunnelDateRange'
import { previousDateRange } from '@/lib/hooks/periodUrl'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatNumber, formatConvertTime } from '@/lib/utils/format'
import { formatDate as formatDisplayDate } from '@/lib/utils/formatDate'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { FunnelDetailSkeleton } from '@/components/skeletons'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import FunnelModal from '@/components/funnels/FunnelModal'
import { FunnelCanvas } from '@/components/funnels/FunnelCanvas'
import { FunnelStepStrip } from '@/components/funnels/FunnelStepStrip'
import { useCan } from '@/lib/auth/permissions'

// ---------------------------------------------------------------------------
// Funnel detail — the revived real route. T9 ships the header + KPI band and
// all the states; the canvas, step strip and trend chart land in T10–T12.
// ---------------------------------------------------------------------------

function DeltaBadge({ change }: { change: PctChangeResult }) {
  if (!change) return null
  if (change.type === 'new') {
    return (
      <span className="rounded-none bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-orange">
        New
      </span>
    )
  }
  const positive = change.value > 0
  return (
    <span className={`text-xs font-medium tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`}>
      {positive ? '↑' : '↓'} {Math.abs(change.value)}%
    </span>
  )
}

function KpiCard({
  label,
  children,
  delta,
}: {
  label: string
  children: React.ReactNode
  delta?: PctChangeResult
}) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-neutral-500">{label}</span>
        {delta != null && <DeltaBadge change={delta} />}
      </div>
      {children}
    </div>
  )
}

export default function FunnelDetailPage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const siteId = params.id as string
  const funnelId = params.funnelId as string
  const canManage = useCan('funnels.manage')

  const { period, dateRange, setPeriod, shiftPeriod } = useFunnelDateRange()
  const {
    data: funnel,
    error: funnelError,
    isLoading: funnelLoading,
    mutate: retryFunnel,
  } = useFunnelDetail(siteId, funnelId)
  const {
    data: stats,
    error: statsError,
    isValidating: statsValidating,
    mutate: retryStats,
  } = useFunnelStats(siteId, funnelId, dateRange.start, dateRange.end)

  const prevRange = useMemo(() => previousDateRange(dateRange), [dateRange])
  const { data: prevStats } = useFunnelStats(
    siteId,
    funnelId,
    prevRange?.start ?? '',
    prevRange?.end ?? '',
  )

  const [modalOpen, setModalOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // * Selected step lives in ?step= (1-based; default 1 stays out of the URL)
  const stepCount = stats?.steps.length ?? 0
  const rawStep = parseInt(searchParams.get('step') ?? '1', 10)
  const selectedStep = Math.max(1, Math.min(stepCount || 1, Number.isNaN(rawStep) ? 1 : rawStep))
  const setSelectedStep = useCallback(
    (n: number) => {
      const next = new URLSearchParams(searchParams.toString())
      if (n <= 1) next.delete('step')
      else next.set('step', String(n))
      const qsNext = next.toString()
      router.replace(qsNext ? `${pathname}?${qsNext}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  useEffect(() => {
    document.title = funnel ? `${funnel.name} · Funnels | Pulse` : 'Funnels | Pulse'
  }, [funnel])

  const qs = searchParams.toString()
  const listHref = `/sites/${siteId}/funnels${qs ? `?${qs}` : ''}`

  // ── Route-level states ─────────────────────────────────────────────
  if (funnelLoading && !funnel) return <FunnelDetailSkeleton />

  if (funnelError) {
    const notFound = funnelError instanceof ApiError && funnelError.status === 404
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        {notFound ? (
          <EmptyState
            icon={<FunnelSimple />}
            title="Funnel not found"
            description="It may have been deleted, or the link points to another site's funnel."
            action={{ label: 'Back to funnels', href: listHref }}
          />
        ) : (
          <ErrorCard
            title="Couldn't load this funnel"
            description="The funnel request failed. Your data is safe — this is a loading problem."
            onRetry={() => { void retryFunnel() }}
          />
        )}
      </div>
    )
  }

  if (!funnel) return <FunnelDetailSkeleton />

  // ── Derived stats ──────────────────────────────────────────────────
  const totalVisitors = stats?.steps[0]?.visitors ?? 0
  const converted = stats?.steps.length ? stats.steps[stats.steps.length - 1].visitors : 0
  const conversion = stats?.steps.length ? stats.steps[stats.steps.length - 1].conversion : 0
  const prevVisitors = prevStats?.steps[0]?.visitors ?? 0
  const prevConverted = prevStats?.steps.length
    ? prevStats.steps[prevStats.steps.length - 1].visitors
    : 0
  const prevConversion = prevStats?.steps.length
    ? prevStats.steps[prevStats.steps.length - 1].conversion
    : 0

  const biggestDrop = stats?.steps.reduce<{ value: string; dropoff: number } | null>(
    (worst, step, i) => {
      if (i === 0) return worst
      if (!worst || step.dropoff > worst.dropoff)
        return { value: step.step.value, dropoff: step.dropoff }
      return worst
    },
    null,
  )

  const windowLabel = `${funnel.conversion_window_value}${funnel.conversion_window_unit === 'hours' ? 'h' : 'd'} window`
  const createdLabel = formatDisplayDate(new Date(funnel.created_at))

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors duration-fast ease-apple hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Funnels
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-white">{funnel.name}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {funnel.description && <span>{funnel.description} · </span>}
              <span className="font-mono text-xs text-neutral-500">
                {windowLabel} · created {createdLabel}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <DateRangePicker
              period={period}
              dateRange={dateRange}
              onPeriodChange={(p) => setPeriod(p as Period)}
              onDateRangeChange={(range) => setPeriod('custom', range)}
              onShift={shiftPeriod}
            />
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setModalOpen(true)}>
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI band — the updating chip covers range changes */}
      <div className="relative">
        <UpdatingChip active={statsValidating} className="-top-1 right-0" />
        {statsError ? (
          <ErrorCard
            title="Couldn't load funnel stats"
            description="The stats request failed for this period."
            onRetry={() => { void retryStats() }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard
              label="Conversion"
              delta={prevStats ? guardedPctChange(conversion, prevConversion, prevVisitors) : null}
            >
              <AnimatedNumber
                value={conversion}
                format={(v) => `${Math.round(v)}%`}
                className="text-xl font-semibold tabular-nums text-white"
              />
            </KpiCard>
            <KpiCard
              label="Visitors"
              delta={prevStats ? guardedPctChange(totalVisitors, prevVisitors, prevVisitors) : null}
            >
              <AnimatedNumber
                value={totalVisitors}
                format={(v) => formatNumber(Math.round(v))}
                className="text-xl font-semibold tabular-nums text-white"
              />
            </KpiCard>
            <KpiCard
              label="Converted"
              delta={prevStats ? guardedPctChange(converted, prevConverted, prevVisitors) : null}
            >
              <AnimatedNumber
                value={converted}
                format={(v) => formatNumber(Math.round(v))}
                className="text-xl font-semibold tabular-nums text-white"
              />
            </KpiCard>
            <KpiCard label="Biggest drop-off">
              {biggestDrop ? (
                <>
                  <span className="text-xl font-semibold tabular-nums text-red-400">
                    {Math.round(biggestDrop.dropoff)}%
                  </span>
                  <p className="mt-0.5 truncate text-xs text-neutral-500" title={biggestDrop.value}>
                    {biggestDrop.value}
                  </p>
                </>
              ) : (
                <span className="text-xl font-semibold text-neutral-600">—</span>
              )}
            </KpiCard>
            <KpiCard label="Median time">
              <span className="text-xl font-semibold tabular-nums text-white">
                {stats?.median_convert_seconds != null
                  ? formatConvertTime(stats.median_convert_seconds)
                  : '—'}
              </span>
            </KpiCard>
          </div>
        )}

        {/* Canvas — step columns with connecting bands; drives ?step= */}
        {!statsError && stats && stats.steps.length > 0 && (
          <>
            <div className="mt-6">
              <FunnelCanvas
                steps={stats.steps}
                selectedStep={selectedStep}
                onSelectStep={setSelectedStep}
              />
            </div>
            <div className="mt-3">
              <FunnelStepStrip
                siteId={siteId}
                funnelId={funnelId}
                steps={stats.steps}
                selectedStep={selectedStep}
                dateRange={dateRange}
              />
            </div>
          </>
        )}
      </div>

      {/* Delete confirm */}
      <Dialog open={confirmingDelete} onOpenChange={() => setConfirmingDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete funnel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{funnel.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-red-600 shadow-none hover:bg-red-500"
              onClick={async () => {
                try {
                  await deleteFunnel(siteId, funnelId)
                  toast.success('Funnel deleted')
                  router.push(listHref)
                } catch {
                  toast.error('Failed to delete funnel')
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      {modalOpen && canManage && (
        <FunnelModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          initialData={funnel}
          onSubmit={async (data: CreateFunnelRequest) => {
            await updateFunnel(siteId, funnelId, data)
            toast.success('Funnel updated')
            void retryFunnel()
            void retryStats()
          }}
        />
      )}
    </div>
  )
}
