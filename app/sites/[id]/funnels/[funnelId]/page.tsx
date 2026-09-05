'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, FunnelSimple } from '@phosphor-icons/react'
import { toast, Button } from '@ciphera-net/facet'
import { updateFunnel, deleteFunnel, type CreateFunnelRequest } from '@/lib/api/funnels'
import { useFunnelDetail, useFunnelStats, useSite } from '@/lib/swr/dashboard'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { FUNNEL_EXCLUDED_PRESETS } from '@/lib/constants/periods'
import { fetchableRange } from '@/lib/dashboard/resolveRange'
import { presetZoneRange } from '@/components/uptime/uptimeMetrics'
import { previousDateRange } from '@/lib/hooks/periodUrl'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { type DimensionFilter, serializeFilters, parseFiltersFromURL } from '@/lib/filters'
import FilterButton from '@/components/dashboard/FilterButton'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
import { formatNumber, formatConvertTime } from '@/lib/utils/format'
import { guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { FunnelDetailSkeleton } from '@/components/skeletons'
import FunnelModal from '@/components/funnels/FunnelModal'
import { FunnelColumns, formatFunnelPct } from '@/components/funnels/FunnelColumns'
import { FunnelStatusLine } from '@/components/funnels/FunnelStatusLine'
import { FunnelStepStrip } from '@/components/funnels/FunnelStepStrip'
import { FunnelDailyInstrument } from '@/components/funnels/FunnelDailyInstrument'
import { DeleteFunnelDialog } from '@/components/funnels/DeleteFunnelDialog'
import { useCan } from '@/lib/auth/permissions'

// ---------------------------------------------------------------------------
// Funnel detail (31-08 overhaul, "tall columns"): ONE panel carries the
// headline and the funnel shape — the five-rail KPI plate and the old
// third-party chart are gone, and nothing on the page states a fact twice.
// Below it: the step panes (Drop-off named + scoped, Breakdown funnel-wide)
// and the Daily instrument, unchanged.
// ---------------------------------------------------------------------------

function HeaderDelta({ change }: { change: PctChangeResult }) {
  if (!change || change.type === 'new') return null
  const positive = change.value > 0
  const unit = change.type === 'pp' ? 'pp' : '%'
  return (
    <span className={`text-xs tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`}>
      {positive ? '↑ ' : '↓ '}
      {Math.abs(change.value)}
      {unit}
    </span>
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

  const { period, dateRange, periodReady, setPeriod, shiftPeriod, pickerProps } = useUrlDateRange({
    // Shared with the funnels list page — one instrument, one range memory.
    pageKey: 'funnels',
    excludePresets: FUNNEL_EXCLUDED_PRESETS,
  })
  const { data: site } = useSite(siteId)
  // * Preset windows re-anchor to the SITE's current day (uptime's device):
  // * the server cuts day boundaries in the site zone, so which dates get
  // * requested must come from the site's calendar too, or "Today" means the
  // * viewer's today (closeout F2). A custom pick passes through.
  const fetchRange = useMemo(
    () => fetchableRange(periodReady, period === 'custom' ? dateRange : presetZoneRange(dateRange, site?.timezone ?? null)),
    [periodReady, period, dateRange, site?.timezone],
  )

  // ── Dashboard filter system, URL-synced with the dashboard's exact codec ──
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = searchParams.get('filters')
    return raw ? parseFiltersFromURL(raw) : []
  })
  const filtersParam = useMemo(() => serializeFilters(filters), [filters])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (filtersParam) url.searchParams.set('filters', filtersParam)
    else url.searchParams.delete('filters')
    window.history.replaceState({}, '', url.toString())
  }, [filtersParam])

  const handleAddFilter = useCallback((filter: DimensionFilter) => {
    setFilters(prev => {
      const isDuplicate = prev.some(
        f => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';')
      )
      if (isDuplicate) return prev
      return [...prev, filter]
    })
  }, [])
  const handleFilterApply = useCallback((filter: DimensionFilter, editingIndex: number | null) => {
    if (editingIndex !== null) {
      setFilters(prev => prev.map((f, i) => (i === editingIndex ? filter : f)))
    } else {
      handleAddFilter(filter)
    }
  }, [handleAddFilter])

  const fetchSuggestions = useFilterSuggestions(siteId, dateRange, filtersParam || undefined)
  const filterBuilder = useFilterBuilder(fetchSuggestions)

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
  } = useFunnelStats(siteId, funnelId, fetchRange.start, fetchRange.end, filtersParam || undefined)

  const prevRange = useMemo(() => previousDateRange(fetchRange), [fetchRange])
  const { data: prevStats } = useFunnelStats(
    siteId,
    funnelId,
    prevRange?.start ?? '',
    prevRange?.end ?? '',
    filtersParam || undefined,
  )

  const [modalOpen, setModalOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // * Bumped after an edit so the panes and Daily refetch immediately — their
  // * SWR keys only carry ids and range, so a step change would otherwise
  // * show pre-edit numbers until the next 60s poll.
  const [editEpoch, setEditEpoch] = useState(0)

  // * Headline facts — stated ONCE, here, and nowhere else on the page.
  const entered = stats?.steps[0]?.visitors ?? null
  const completed = stats?.steps.length ? stats.steps[stats.steps.length - 1].visitors : null
  const conversion = stats?.steps.length ? stats.steps[stats.steps.length - 1].conversion : null
  const prevConversion = prevStats?.steps.length ? prevStats.steps[prevStats.steps.length - 1].conversion : null
  const prevEntered = prevStats?.steps[0]?.visitors ?? 0
  const conversionDelta =
    conversion != null && prevConversion != null && prevStats
      ? guardedPointChange(conversion, prevConversion, prevEntered)
      : null

  // * Selected step lives in ?step= (1-based). The DEFAULT is the biggest
  // * drop-off step — the one the Drop-off pane has something to say about —
  // * and the default stays out of the URL.
  const stepCount = stats?.steps.length ?? 0
  const defaultStep = useMemo(() => {
    if (!stats || stats.steps.length < 2) return 1
    let best = 1
    let bestLost = -1
    for (let i = 0; i + 1 < stats.steps.length; i++) {
      const lost = stats.steps[i].visitors - stats.steps[i + 1].visitors
      if (lost > bestLost) {
        bestLost = lost
        best = i + 1
      }
    }
    return best
  }, [stats])
  const rawStepParam = searchParams.get('step')
  const rawStep = rawStepParam != null ? parseInt(rawStepParam, 10) : defaultStep
  const selectedStep = Math.max(1, Math.min(stepCount || 1, Number.isNaN(rawStep) ? defaultStep : rawStep))
  const setSelectedStep = useCallback(
    (n: number) => {
      const next = new URLSearchParams(searchParams.toString())
      if (n === defaultStep) next.delete('step')
      else next.set('step', String(n))
      const qsNext = next.toString()
      router.replace(qsNext ? `${pathname}?${qsNext}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, defaultStep],
  )

  useEffect(() => {
    document.title = funnel ? `${funnel.name} · Funnels | Pulse` : 'Funnels | Pulse'
  }, [funnel])

  // * The back link carries the RANGE only — never ?step= or ?filters=. Those
  // * are this funnel's state; carried back, the list re-emitted them into
  // * every card link and funnel B opened with funnel A's filters applied.
  const listHref = useMemo(() => {
    const keep = new URLSearchParams()
    for (const key of ['period', 'start', 'end']) {
      const v = searchParams.get(key)
      if (v) keep.set(key, v)
    }
    const s = keep.toString()
    return `/sites/${siteId}/funnels${s ? `?${s}` : ''}`
  }, [siteId, searchParams])

  // ── Route-level states ─────────────────────────────────────────────
  if (funnelLoading && !funnel) return <FunnelDetailSkeleton />

  if (funnelError) {
    // Duck-typed like the funnels list and the dashboard's device, NOT
    // instanceof: chunk-split bundles can hold two ApiError classes, and
    // instanceof across them is false for a real 404 (measured on staging —
    // the 404 rendered the generic card).
    const notFound = (funnelError as { status?: number })?.status === 404
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
            {funnel.description && <p className="mt-1 text-sm text-neutral-400">{funnel.description}</p>}
            <FunnelStatusLine timezone={site?.timezone} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <FilterPills
              filters={filters}
              onEdit={(index, anchor) => filterBuilder.openEdit(filters[index], index, anchor)}
              onRemove={(index) => setFilters(prev => prev.filter((_, i) => i !== index))}
              onClear={() => setFilters([])}
            />
            <FilterButton
              hasActiveFilters={filters.length > 0}
              active={filterBuilder.open}
              onClick={(anchor) => filterBuilder.openCreate(anchor)}
            />
            <DateRangePicker
              period={period}
              dateRange={dateRange}
              onPeriodChange={(p) => setPeriod(p as Period)}
              onDateRangeChange={(range) => setPeriod('custom', range)}
              onShift={shiftPeriod}
              // * Menu and validation both come from the page declaration on
              // * the hook (FUNNEL_EXCLUDED_PRESETS) — one source, no drift.
              {...pickerProps}
            />
            {canManage && (
              <>
                {/* Header actions are chrome/toolbar estate-wide (uptime,
                    performance) — same height and weight as the range picker
                    they sit beside. */}
                <Button variant="chrome" size="toolbar" onClick={() => setModalOpen(true)}>
                  Edit
                </Button>
                <Button
                  variant="chrome"
                  size="toolbar"
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

      {/* The funnel panel — headline + columns, one UpdatingChip for the page */}
      <div className="relative">
        <UpdatingChip active={statsValidating} className="-top-1 right-0" />
        {statsError ? (
          <ErrorCard
            title="Couldn't load funnel stats"
            description="The stats request failed for this period."
            onRetry={() => { void retryStats() }}
          />
        ) : (
          <div className="rounded-none border border-border bg-card">
            <div className="flex h-12 items-center justify-between gap-4 border-b border-border px-4">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 text-sm font-medium text-white">Conversion</span>
                <span className="text-xl font-semibold tabular-nums text-white">
                  {conversion != null ? formatFunnelPct(conversion) : <span className="text-neutral-600">—</span>}
                </span>
                {stats && entered != null && (
                  <span className="truncate text-xs tabular-nums text-neutral-500">
                    {entered > 0
                      ? `${formatNumber(completed ?? 0)} of ${formatNumber(entered)} entered`
                      : 'no visitors entered in this period'}
                  </span>
                )}
                <HeaderDelta change={conversionDelta} />
              </div>
              {stats?.median_convert_seconds != null && (
                <span className="shrink-0 text-xs text-neutral-500">
                  median time to convert {formatConvertTime(stats.median_convert_seconds)}
                </span>
              )}
            </div>
            {stats && stats.steps.length > 0 && (entered ?? 0) > 0 ? (
              <div className="px-4 pb-3 pt-2">
                <FunnelColumns
                  steps={stats.steps}
                  selectedStep={selectedStep}
                  onSelectStep={setSelectedStep}
                />
              </div>
            ) : stats ? (
              <p className="px-4 py-6 text-sm text-neutral-500">
                No sessions entered this funnel in the selected period.
              </p>
            ) : (
              <div className="h-72" />
            )}
          </div>
        )}

        {!statsError && stats && stats.steps.length > 0 && (
          <>
            <div className="mt-3">
              {/* Both of these FETCH, so they take fetchRange (the site-day
                  re-anchored window) — not the picker's display value, or one
                  screen would query two different ranges. */}
              <FunnelStepStrip
                siteId={siteId}
                funnelId={funnelId}
                steps={stats.steps}
                selectedStep={selectedStep}
                dateRange={fetchRange}
                filters={filtersParam || undefined}
                editEpoch={editEpoch}
              />
            </div>
            <div className="mt-3">
              <FunnelDailyInstrument
                siteId={siteId}
                funnelId={funnelId}
                dateRange={fetchRange}
                period={period}
                filters={filtersParam || undefined}
                stats={stats}
                prevStats={prevStats}
                editEpoch={editEpoch}
              />
            </div>
          </>
        )}
      </div>

      {/* Filter popover — create anchors to the button, edit to the pill */}
      <FilterBuilder builder={filterBuilder} filters={filters} onApply={handleFilterApply} />

      <DeleteFunnelDialog
        open={confirmingDelete}
        funnelName={funnel.name}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          try {
            await deleteFunnel(siteId, funnelId)
            toast.success('Funnel deleted')
            router.push(listHref)
          } catch {
            toast.error('Failed to delete funnel')
          }
        }}
      />

      {/* Edit modal — dateRange feeds the live preview (the detail page used
          to omit it, so the same modal previewed from the list and silently
          didn't from the funnel you were looking at). */}
      {modalOpen && canManage && (
        <FunnelModal
          isOpen={modalOpen}
          siteId={siteId}
          dateRange={fetchRange}
          onClose={() => setModalOpen(false)}
          initialData={funnel}
          onSubmit={async (data: CreateFunnelRequest) => {
            await updateFunnel(siteId, funnelId, data)
            toast.success('Funnel updated')
            void retryFunnel()
            void retryStats()
            setEditEpoch((e) => e + 1)
          }}
        />
      )}
    </div>
  )
}
