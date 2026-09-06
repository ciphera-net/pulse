'use client'

import { useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'

import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { fetchableRange } from '@/lib/dashboard/resolveRange'
import { presetUtcRange } from '@/components/uptime/uptimeMetrics'
import { CloudArrowUp } from '@phosphor-icons/react'
import { useCan } from '@/lib/auth/permissions'
import { InstrumentOffState } from '@/components/ui/InstrumentOffState'
import { useSite, useBunnyStatus, useBunnyOverview, useBunnyDailyStats, useBunnyRegions } from '@/lib/swr/dashboard'

import DateRangePicker from '@/components/ui/DateRangePicker'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { SyncStatusLine } from '@/components/integrations/SyncStatusLine'
import { CDNSkeleton } from '@/components/skeletons'
import { EdgeCard, OriginCard } from '@/components/cdn/CdnSplitInstrument'
import { CdnLiveCard } from '@/components/cdn/CdnLiveCard'
import { toCdnSeries, statusMix, cdnDayLabel, CDN_PICKER_PRESETS } from '@/components/cdn/cdnMetrics'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'

export default function CDNPage() {
  const params = useParams()
  const siteId = params.id as string
  const canManageIntegrations = useCan('integrations.manage')

  const { period, dateRange, periodReady, setPeriod, shiftPeriod, pickerProps } = useUrlDateRange({
    pageKey: 'cdn',
    extraPresets: CDN_PICKER_PRESETS,
  })
  // * bunny_data days are UTC days (Bunny's chart convention, verified live).
  // * Preset windows anchor to the current UTC day — west of UTC, a local
  // * anchor would silently drop the newest day. An explicitly picked custom
  // * range passes through: the chosen calendar day IS the UTC day, as labeled.
  // Gate BEFORE the UTC re-anchor: presetUtcRange of a placeholder range is
  // still a placeholder range, just in a different frame.
  const effectiveRange = fetchableRange(periodReady, period === 'custom' ? dateRange : presetUtcRange(dateRange))

  const { data: bunnyStatus, error: bunnyStatusError, mutate: retryBunnyStatus } = useBunnyStatus(siteId)
  const connected = !!bunnyStatus?.connected
  const { data: site } = useSite(siteId)
  const {
    data: overview,
    isLoading: overviewLoading,
    isValidating: overviewValidating,
    mutate: mutateOverview,
  } = useBunnyOverview(connected ? siteId : '', effectiveRange.start, effectiveRange.end)
  const {
    data: dailyStats,
    isValidating: dailyValidating,
    error: dailyError,
    mutate: mutateDaily,
  } = useBunnyDailyStats(connected ? siteId : '', effectiveRange.start, effectiveRange.end)
  const {
    data: regionsData,
    isValidating: regionsValidating,
    error: regionsError,
    mutate: mutateRegions,
  } = useBunnyRegions(connected ? siteId : '', effectiveRange.start, effectiveRange.end)

  const series = useMemo(() => toCdnSeries(dailyStats?.daily_stats ?? []), [dailyStats])
  const mix = useMemo(() => statusMix(series), [series])

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `CDN · ${domain} | Pulse` : 'CDN | Pulse'
  }, [site?.domain])

  // A DEAD status check is a failure, stated as one — `undefined + error`
  // means SWR has given up, not "loading", and the skeleton must not render
  // forever. Checked BEFORE the skeleton gate. Same device as the dashboard
  // and Search: ErrorCard + Retry, header preserved.
  if (bunnyStatus === undefined && bunnyStatusError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-white">CDN</h1>
          <p className="mt-1 text-sm text-neutral-400">Bunny bandwidth, requests, cache performance and errors</p>
        </div>
        <ErrorCard
          title="Couldn’t check the Bunny connection"
          description="The connection status request failed. Your data is intact — this is a loading problem, not a data problem."
          onRetry={() => {
            void retryBunnyStatus()
          }}
        />
      </div>
    )
  }

  if (bunnyStatus === undefined || (connected && overview === undefined && overviewLoading)) {
    return <CDNSkeleton />
  }

  // ─── Not connected — the shared off-state shell (closeout ruling 1b) ──
  // No date picker here: a range control over a not-connected instrument is
  // dead chrome. The ghost rails preview the two cards' five metrics.
  if (!connected) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-white">CDN</h1>
          <p className="mt-1 text-sm text-neutral-400">Bunny bandwidth, requests, cache performance and errors</p>
        </div>
        <InstrumentOffState
          rails={['Served from cache', 'Cache hit rate', 'Origin traffic', 'Origin latency', 'Errors']}
          icon={<CloudArrowUp size={40} />}
          heading="Connect Bunny CDN"
          body="See bandwidth, cache performance and errors. Read-only · uses a Bunny API key with account-wide scope · synced every 3 hours."
          canAct={canManageIntegrations}
          action={{ label: 'Connect in Settings', href: '/settings/site/integrations' }}
          fallback="An owner or admin can connect it."
        />
      </div>
    )
  }

  const empty = connected && dailyStats !== undefined && series.length === 0
  const anyValidating = overviewValidating || dailyValidating || regionsValidating

  const cardProps = {
    series,
    overview,
    regions: regionsData?.regions,
    regionsTotal: regionsData?.total_bandwidth ?? 0,
    regionsError: !!regionsError,
    onRetryRegions: () => {
      void mutateRegions()
    },
    mix,
    empty,
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
      {/* Header — title · plain description · quiet status line. */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-white">CDN</h1>
          <p className="mt-1 text-sm text-neutral-400">Bunny bandwidth, requests, cache performance and errors</p>
          {connected && (
            <SyncStatusLine
              status={bunnyStatus.status}
              lastSyncedAt={bunnyStatus.last_synced_at}
              errorMessage={bunnyStatus.error_message}
              settingsHref="/settings/site/integrations"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <UpdatingChip active={connected && anyValidating && !!overview} />
          <DateRangePicker
            period={period}
            dateRange={dateRange}
            onPeriodChange={(p) => setPeriod(p as Period)}
            onDateRangeChange={(range) => setPeriod('custom', range)}
            onShift={shiftPeriod}
            align="right"
            {...pickerProps}
          />
        </div>
      </div>

      {/* The split instrument: Edge (what Bunny absorbed) vs Origin (what got
          through). The not-connected state early-returns above, so these
          always render connected. */}
      <div data-tour="cdn-split" className="relative">
        <div className="flex flex-col gap-6 lg:flex-row">
          <EdgeCard {...cardProps} />
          <OriginCard {...cardProps} />
        </div>
      </div>

      {/* Daily-stats failure is a page-level fact (both cards draw from it). */}
      {connected && dailyError && (
        <div className="mt-6 flex justify-center">
          <ErrorCard
            title="Couldn't load CDN statistics"
            onRetry={() => {
              void mutateDaily()
              void mutateOverview()
            }}
          />
        </div>
      )}

      {/* The live now-view (D3): trailing 24 complete UTC hours, fetched live
          per request — the daily instrument above stays the durable record. */}
      {connected && <CdnLiveCard siteId={siteId} />}

      {/* Spec plate — zone identity, one hairline row below the instrument.
          The right side states the coverage boundary only when the loaded
          data starts after the requested range (never fabricated). */}
      {connected && (
        <div className="mt-6 flex h-8 items-center justify-between gap-4 rounded-none border border-border bg-card px-4">
          <span className="truncate font-mono text-xs text-neutral-600">
            {bunnyStatus.pull_zone_name} · zone {bunnyStatus.pull_zone_id}
          </span>
          <span className="shrink-0 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1">
              days are UTC
              <TermInfoTip term="cdn_utc_days" />
            </span>
            <span className="ml-1 inline-flex items-center gap-1">
              · unmeasured shows —
              <TermInfoTip term="cdn_zero_fill_absence" />
            </span>
            {series.length > 0 && series[0].date.toISOString().slice(0, 10) > effectiveRange.start && (
              <span className="ml-1 inline-flex items-center gap-1">
                · data begins {cdnDayLabel(series[0].date)}
                <TermInfoTip term="cdn_backfill_caps" />
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
