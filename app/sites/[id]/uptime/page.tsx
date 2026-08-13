'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { useCan } from '@/lib/auth/permissions'
import { useSite, useUptimeStatus, useUptimeIncidents, useUptimeChecks } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { toast, Button } from '@ciphera-net/facet'
import { UptimeSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { getDateRange } from '@/lib/utils/format'
import type { PeriodPreset } from '@/lib/constants/periods'
import UptimePanel from '@/components/uptime/UptimePanel'
import IncidentsTable from '@/components/uptime/IncidentsTable'
import MonitorStrip from '@/components/uptime/MonitorStrip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import {
  UPTIME_METRIC_ORDER,
  UPTIME_METRIC_LABEL,
  UPTIME_POS,
  UPTIME_NEG,
  UPTIME_DEGRADED,
  fmtMs,
  fmtCheckTimeUTC,
  presetUtcRange,
} from '@/components/uptime/uptimeMetrics'

// ---------------------------------------------------------------------------
// Uptime — the instrument-panel layout. One range control (the picker, with
// uptime's page-scoped presets; 12m is bounded by the API's 366-day cap), the
// UptimePanel where each metric row is tile and strip at once, the incident
// ledger, and the monitor strip. All day/hour bucketing is the server's, in
// UTC — deliberately (decision D5).
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

// ─── Recent checks (compact log under the ledger) ─────────────────

const CHECK_DOT: Record<string, string> = {
  up: UPTIME_POS,
  degraded: UPTIME_DEGRADED,
  down: UPTIME_NEG,
}

function RecentChecks({ siteId, monitorId }: { siteId: string; monitorId: string | undefined }) {
  const { data: checks } = useUptimeChecks(siteId, monitorId, 20)
  if (!checks || checks.length === 0) return null
  return (
    <div className="rounded-none border border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-medium text-white">Recent checks</span>
        <span className="text-xs text-neutral-500">last {checks.length} · times are UTC</span>
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
            <span className="ml-2.5 shrink-0 tabular-nums text-neutral-300">{fmtCheckTimeUTC(c.checked_at)}</span>
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

  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()

  // * The API reads UTC calendar days; useUrlDateRange builds LOCAL ones.
  // * Preset windows re-anchor to the current UTC day so the newest checks
  // * never fall off the range west of UTC; a custom pick passes through —
  // * an explicitly chosen calendar day IS the UTC day, as labeled.
  const apiRange = useMemo(
    () => (period === 'custom' ? dateRange : presetUtcRange(dateRange)),
    [period, dateRange],
  )

  const { data: site, mutate: mutateSite } = useSite(siteId)
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
  if (!site) return <div className="p-8 text-neutral-500">Site not found</div>

  // ─── Disabled — the panel's shape, ghosted, with the CTA ──────

  if (!site.uptime_enabled) {
    return (
      <div className={`mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 ${fadeClass}`}>
        <div className="mb-6">
          <h1 className="mb-1 text-lg font-semibold text-neutral-200">Uptime</h1>
          <p className="text-sm text-neutral-400">Availability, response time and incident history</p>
        </div>
        <div className="flex rounded-none border border-border bg-card">
          {/* Ghost rails — what the page becomes once enabled */}
          <div className="hidden w-48 shrink-0 flex-col border-r border-border sm:flex" aria-hidden="true">
            {UPTIME_METRIC_ORDER.map((key) => (
              <div key={key} className="flex flex-1 flex-col justify-center border-t border-border px-4 py-4 first:border-t-0">
                <span className="text-sm text-neutral-600">{UPTIME_METRIC_LABEL[key]}</span>
                <span className="mt-0.5 text-xl font-semibold text-neutral-700">&mdash;</span>
              </div>
            ))}
          </div>
          <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <h2 className="mb-2 text-xl font-semibold text-white">Uptime monitoring is off</h2>
            <p className="mb-6 max-w-md text-sm text-neutral-400">
              Check <span className="font-mono text-neutral-300">https://{site.domain}</span> every 5 minutes —
              availability, response time and incident history, with alerts by email, Slack, Discord or webhook.
            </p>
            {canEdit ? (
              <Button onClick={() => handleToggleUptime(true)} disabled={toggling}>
                {toggling ? 'Enabling…' : 'Enable uptime monitoring'}
              </Button>
            ) : (
              <p className="text-xs text-neutral-500">An owner or admin can enable it.</p>
            )}
          </div>
        </div>
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
          <p className="mt-1 text-sm text-neutral-400">
            {monitor ? (
              <>
                <span className="font-mono text-neutral-300">{monitor.url}</span>
                {' · '}checked every {Math.round(monitor.check_interval_seconds / 60)} minutes
              </>
            ) : (
              'Availability, response time and incident history'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            period={period}
            dateRange={dateRange}
            onPeriodChange={(p) => setPeriod(p as Period)}
            onDateRangeChange={(range) => setPeriod('custom', range)}
            onShift={shiftPeriod}
            extraPresets={UPTIME_PICKER_PRESETS}
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
              status={overallStatus}
            />
          </motion.div>

          <motion.div {...cascade(0.08)} className="mt-6">
            <IncidentsTable
              incidents={incidentsError ? undefined : incidentsData?.incidents}
              error={!!incidentsError}
              dateRange={apiRange}
            />
          </motion.div>

          <motion.div {...cascade(0.14)} className="mt-6 space-y-6">
            <MonitorStrip monitor={monitor} />
            <RecentChecks siteId={siteId} monitorId={monitor.id} />
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
