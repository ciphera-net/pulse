'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { Heartbeat } from '@phosphor-icons/react'
import { useCan } from '@/lib/auth/permissions'
import { InstrumentOffState } from '@/components/ui/InstrumentOffState'
import { useSite, useUptimeStatus, useUptimeIncidents, useUptimeChecks } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import type { UptimeMonitor } from '@/lib/api/uptime'
import { formatRelativeTime } from '@/lib/utils/formatDate'
import { toast, Button } from '@ciphera-net/facet'
import { UptimeSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { fetchableRange } from '@/lib/dashboard/resolveRange'
import { getDateRange } from '@/lib/utils/format'
import type { PeriodPreset } from '@/lib/constants/periods'
import UptimePanel from '@/components/uptime/UptimePanel'
import IncidentsTable from '@/components/uptime/IncidentsTable'
import { ErrorCard } from '@/components/ui/ErrorCard'
import {
  UPTIME_METRIC_ORDER,
  UPTIME_METRIC_LABEL,
  UPTIME_POS,
  UPTIME_NEG,
  UPTIME_DEGRADED,
  fmtMs,
  fmtCheckTime,
  presetZoneRange,
} from '@/components/uptime/uptimeMetrics'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'

// ---------------------------------------------------------------------------
// Uptime — the instrument-panel layout. One range control (the picker, with
// uptime's page-scoped presets; 12m is bounded by the API's 366-day cap), the
// UptimePanel where each metric row is tile and strip at once, the incident
// ledger, and the monitor strip. All day/hour bucketing is the server's, in
// the SITE's timezone (22-08-2026 alignment — supersedes decision D5; days
// older than the raw-check retention stay UTC-bucketed and the panel labels
// that boundary).
// ---------------------------------------------------------------------------

const cascade = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION_BASE, ease: EASE_APPLE, delay },
})

// * The DateRangePicker is the ONE range control on this page (owner call,
// * 13-08: a pill row beside the picker was two controls for one job). These
// * page-scoped presets keep the uptime vocabulary one click away in the
// * picker — 7d/30d are global presets already; without this group the
// * month-scale ranges would label as "Custom" and check-mark nothing.
// * No 24h preset on purpose: the API is UTC-day-granular, so a "24h"
// * shortcut would really be an up-to-48-hour window wearing a 24h label —
// * 7d is the smallest preset and still renders at HOURLY resolution (the
// * server serves hourly buckets for ranges ≤ 8 days).
const UPTIME_PICKER_PRESETS: { group: string; presets: PeriodPreset[] } = {
  group: 'Uptime ranges',
  presets: [
    { key: '3m', label: 'Last 3 months', group: 'Uptime ranges', resolve: () => getDateRange(90) },
    { key: '6m', label: 'Last 6 months', group: 'Uptime ranges', resolve: () => getDateRange(180) },
    { key: '12m', label: 'Last 12 months', group: 'Uptime ranges', resolve: () => getDateRange(365) },
  ],
}

// ─── Header status line (the SyncStatusLine grammar, for the checker) ──

const STATUS_LINE: Record<string, { label: string; color: string; tone?: string }> = {
  operational: { label: 'Operational', color: UPTIME_POS },
  degraded: { label: 'Degraded', color: UPTIME_DEGRADED, tone: UPTIME_DEGRADED },
  down: { label: 'Down', color: UPTIME_NEG, tone: UPTIME_NEG },
}

function UptimeStatusLine({ monitor, status }: { monitor: UptimeMonitor; status: 'operational' | 'degraded' | 'down' }) {
  const cadence = `checked every ${Math.round(monitor.check_interval_seconds / 60)} minutes`
  if (monitor.last_status === 'unknown') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-600" />
        Waiting for the first check · {cadence}
      </p>
    )
  }
  const s = STATUS_LINE[status]
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
      <span style={s.tone ? { color: s.tone } : undefined} className={s.tone ? undefined : 'text-neutral-400'}>
        {s.label}
      </span>
      {monitor.last_response_time_ms != null && monitor.last_checked_at && (
        <span className="tabular-nums">
          · last check {fmtMs(monitor.last_response_time_ms)}, {formatRelativeTime(monitor.last_checked_at)}
        </span>
      )}
      <span>· {cadence}</span>
    </p>
  )
}

// ─── Recent checks (compact log under the ledger) ─────────────────

const CHECK_DOT: Record<string, string> = {
  up: UPTIME_POS,
  degraded: UPTIME_DEGRADED,
  down: UPTIME_NEG,
}

function RecentChecks({ siteId, monitorId, timezone }: { siteId: string; monitorId: string | undefined; timezone: string | null }) {
  const { data: checks } = useUptimeChecks(siteId, monitorId, 20)
  if (!checks || checks.length === 0) return null
  return (
    <div className="rounded-none border border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="flex items-center gap-1 text-sm font-medium text-white">
          Recent checks
          <TermInfoTip term="recent_checks" />
        </span>
        <span className="text-xs text-neutral-500">last {checks.length}</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {checks.map((c) => (
          <div key={c.id} className="flex h-8 items-center px-3 text-xs hover:bg-neutral-800/40">
            {/* Dot = CONFIRMED status, same convention as every aggregate on
                the page; a grace-period blip must not show red against a
                100% availability rail. */}
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: CHECK_DOT[c.effective_status ?? c.status] ?? '#737373' }}
            />
            <span className="ml-2.5 shrink-0 tabular-nums text-neutral-300">{fmtCheckTime(c.checked_at, timezone)}</span>
            {/* A failed check finally shows WHY — the error was always fetched, never rendered */}
            {c.error_message && (
              <span className="ml-3 min-w-0 flex-1 truncate font-mono text-neutral-500">{c.error_message}</span>
            )}
            {!c.error_message && <span className="min-w-0 flex-1" />}
            <span className="ml-3 w-12 shrink-0 text-right font-mono text-neutral-400">{c.status_code ?? '—'}</span>
            <span className="ml-3 w-16 shrink-0 text-right tabular-nums text-neutral-300">
              {c.response_time_ms == null ? '—' : fmtMs(c.response_time_ms)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────

export default function UptimePage() {
  const canEdit = useCan('uptime.manage')
  const params = useParams()
  const siteId = params.id as string

  const { period, dateRange, periodReady, setPeriod, shiftPeriod, pickerProps } = useUrlDateRange({
    pageKey: 'uptime',
    extraPresets: UPTIME_PICKER_PRESETS,
  })

  const { data: site, error: siteError, mutate: mutateSite } = useSite(siteId)

  // * The API reads SITE-timezone calendar days; useUrlDateRange builds
  // * VIEWER-local ones. Preset windows re-anchor to the site's current day
  // * so the newest checks never fall off for a viewer west of the site; a
  // * custom pick passes through — an explicitly chosen calendar day IS the
  // * site's day, as labeled.
  // Gated BEFORE the re-anchor — presetZoneRange of a placeholder is still
  // a placeholder. Uptime's two hooks keyed on siteId ALONE, so an empty range
  // used to fetch anyway; they now require dates (see lib/swr/dashboard.ts).
  const apiRange = useMemo(
    () => fetchableRange(periodReady, period === 'custom' ? dateRange : presetZoneRange(dateRange, site?.timezone ?? null)),
    [periodReady, period, dateRange, site?.timezone],
  )
  const {
    data: uptimeData,
    isLoading,
    error: uptimeError,
    mutate: mutateUptime,
  } = useUptimeStatus(siteId, apiRange.start, apiRange.end)
  const { data: incidentsData, error: incidentsError } = useUptimeIncidents(siteId, apiRange.start, apiRange.end)
  const [toggling, setToggling] = useState(false)

  // * Single monitor from the auto-managed uptime system
  const monitor = uptimeData?.monitors?.[0]?.monitor ?? null
  const overallStatus = uptimeData?.status ?? 'operational'

  const handleToggleUptime = async (enabled: boolean) => {
    if (!site) return
    setToggling(true)
    try {
      await updateSite(site.id, {
        name: site.name,
        timezone: site.timezone,
        is_public: site.is_public,
        excluded_paths: site.excluded_paths,
        uptime_enabled: enabled,
      })
      mutateSite()
      mutateUptime()
      toast.success(enabled ? 'Uptime monitoring enabled' : 'Uptime monitoring disabled')
    } catch {
      toast.error('Failed to update uptime monitoring')
    } finally {
      setToggling(false)
    }
  }

  useEffect(() => {
    if (site?.domain) document.title = `Uptime · ${site.domain} | Pulse`
  }, [site?.domain])

  const showSkeleton = useMinimumLoading(isLoading && !uptimeData)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) return <UptimeSkeleton />
  // F8, propagated from the dashboard: a failed site request is a FAILURE,
  // stated as one — only an actual 404 earns "Site not found". Anything else
  // gets the estate's one error device; still in flight keeps the skeleton.
  if (!site) {
    const status = (siteError as { status?: number } | undefined)?.status
    if (siteError && status !== 404) {
      return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-white">Uptime</h1>
            <p className="mt-1 text-sm text-neutral-400">Availability, response time and incident history</p>
          </div>
          <ErrorCard
            title="Couldn’t load uptime"
            description="The site request failed. Your monitoring is unaffected — this is a loading problem, not a data problem."
            onRetry={() => {
              void mutateSite()
            }}
          />
        </div>
      )
    }
    if (!siteError) return <UptimeSkeleton />
    return <div className="p-8 text-neutral-500">Site not found</div>
  }

  // ─── Disabled — the panel's shape, ghosted, with the CTA ──────

  if (!site.uptime_enabled) {
    return (
      <div className={`mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 ${fadeClass}`}>
        <div className="mb-6">
          <h1 className="mb-1 text-lg font-semibold text-neutral-200">Uptime</h1>
          <p className="text-sm text-neutral-400">Availability, response time and incident history</p>
        </div>
        <InstrumentOffState
          rails={UPTIME_METRIC_ORDER.map((key) => UPTIME_METRIC_LABEL[key])}
          icon={<Heartbeat size={40} />}
          heading="Uptime monitoring is off"
          body={
            <>
              Check <span className="font-mono text-neutral-300">https://{site.domain}</span> every 5 minutes —
              availability, response time and incident history, with alerts by email and in the dashboard.
            </>
          }
          canAct={canEdit}
          action={{
            label: toggling ? 'Enabling…' : 'Enable uptime monitoring',
            onClick: () => handleToggleUptime(true),
            disabled: toggling,
          }}
        />
      </div>
    )
  }

  // ─── Enabled — the instrument ─────────────────────────────────

  return (
    <div className={`mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 ${fadeClass}`}>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-neutral-200">Uptime</h1>
          <p className="mt-1 text-sm text-neutral-400">Availability, response time and incident history</p>
          {monitor && <UptimeStatusLine monitor={monitor} status={overallStatus} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            period={period}
            dateRange={dateRange}
            onPeriodChange={(p) => setPeriod(p as Period)}
            onDateRangeChange={(range) => setPeriod('custom', range)}
            onShift={shiftPeriod}
            {...pickerProps}
          />
          {canEdit && (
            <Button variant="chrome" size="toolbar" onClick={() => handleToggleUptime(false)} isLoading={toggling}>
              Disable monitoring
            </Button>
          )}
        </div>
      </div>

      {monitor ? (
        <>
          <motion.div {...cascade(0)}>
            <UptimePanel
              siteId={siteId}
              monitor={monitor}
              dateRange={apiRange}
              incidents={incidentsError ? undefined : incidentsData?.incidents}
              timezone={site?.timezone ?? null}
              utcDaysBefore={uptimeData?.utc_days_before}
            />
          </motion.div>

          <motion.div {...cascade(0.08)} className="mt-6">
            <IncidentsTable
              incidents={incidentsError ? undefined : incidentsData?.incidents}
              error={!!incidentsError}
              timeoutSeconds={monitor.timeout_seconds}
              timezone={site?.timezone ?? null}
            />
          </motion.div>

          <motion.div {...cascade(0.14)} className="mt-6">
            <RecentChecks siteId={siteId} monitorId={monitor.id} timezone={site?.timezone ?? null} />
          </motion.div>
        </>
      ) : uptimeError && !uptimeData ? (
        // * A failed status request is an ERROR, not a setup state — reporting
        // * it as "setting up" would be a false success (review finding).
        <ErrorCard
          title="Couldn't load uptime status"
          description="The uptime request failed. Your monitoring is unaffected — this is a loading problem."
          onRetry={() => { void mutateUptime() }}
        />
      ) : (
        // * Enabled moments ago — the monitor row exists after the toggle's
        // * auto-create, but a fresh SWR read may not carry it yet.
        <div className="rounded-none border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-neutral-400">Setting up the monitor…</p>
          <p className="mt-1 text-xs text-neutral-500">The first check lands within a minute.</p>
        </div>
      )}
    </div>
  )
}
