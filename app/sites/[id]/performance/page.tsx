'use client'

import { useCan } from '@/lib/auth/permissions'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useSite, usePerformanceConfig, usePerformanceLatest, usePerformanceHistory } from '@/lib/swr/dashboard'
import {
  updatePerformanceConfig,
  triggerPerformanceCheck,
  getPerformanceLatest,
  getPerformanceCheck,
  type PerformanceCheck,
  type AuditSummary,
} from '@/lib/api/performance'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { toast, Button } from '@ciphera-net/facet'
import Select from '@/components/ui/select'
import { motion } from 'framer-motion'
import ScoreGauge from '@/components/performance/ScoreGauge'
import { PerformanceStatusLine } from '@/components/performance/PerformanceStatusLine'
import { formatSiteStampShort } from '@/lib/utils/siteTime'
import { PerformanceTrend } from '@/components/performance/PerformanceTrend'
import { auditDescription } from '@/lib/performance/descriptions'
import { remapLearnUrl } from '@/lib/learn-links'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { useMinimumLoading } from '@/components/skeletons'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { TERMS } from '@/lib/dashboard/terms'

type Strategy = 'mobile' | 'desktop'

// 🔴 `min-w-0` IS LOAD-BEARING, not tidiness. These cards are grid items, and a
// grid item defaults to `min-width: auto` — so the TRACK is sized by the widest
// item's min-content, and one card that cannot shrink widens every card on the
// page. Measured at 375 px before this was added: main scrollWidth 578 against
// a 373 px client width, i.e. 205 px of the page silently cut off, because the
// shell's `overflow-x-hidden` DELETES what it clips instead of letting it
// scroll. /uptime and /cdn measured 373/373 in the same harness, which is what
// identified this as the page's fault rather than the shell's.
const CARD = 'min-w-0 rounded-none border border-border bg-card'
const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-neutral-400'

// * Google's Core Web Vitals thresholds: [good, needs-improvement] boundaries.
const METRIC_THRESHOLDS: Record<string, [number, number]> = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  tbt: [200, 600],
  fcp: [1800, 3000],
  si: [3400, 5800],
  tti: [3800, 7300],
}

// * The "good" boundary, spelled out under each metric. A number with no
// * threshold beside it asks the reader to already know what good looks like.
const METRIC_GOOD_LABEL: Record<string, string> = {
  fcp: '< 1.8s',
  lcp: '< 2.5s',
  tbt: '< 200ms',
  cls: '< 0.1',
  si: '< 3.4s',
  tti: '< 3.8s',
}

function metricBand(metric: string, value: number | null): 'good' | 'warn' | 'poor' | 'unknown' {
  if (value === null) return 'unknown'
  const [good, poor] = METRIC_THRESHOLDS[metric] ?? [0, 0]
  if (value <= good) return 'good'
  if (value <= poor) return 'warn'
  return 'poor'
}

const BAND_DOT: Record<string, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  poor: 'bg-red-500',
  unknown: 'bg-neutral-600',
}

// * The four category scores' registry keys. Shared by the hero gauges (which
// * carry the definition via aria-describedby, since they sit inside a
// * scroll-to button) and the accordion headers below (the one VISIBLE glyph
// * per term — rule: no two glyphs on screen open the same sentence).
const SCORE_TERM: Record<string, string> = {
  performance: 'performance_score',
  accessibility: 'accessibility_score',
  'best-practices': 'best_practices_score',
  seo: 'seo_score',
}

// * Only the metrics whose definition teaches something the visible label and
// * "good <threshold>" caption do not already say. FCP and LCP mostly restate
// * that caption once unpacked, so they stay bare (grammar rule: a definition
// * that would only restate the visible label gets no glyph).
const METRIC_TERM: Partial<Record<string, string>> = {
  tbt: 'metric_tbt',
  cls: 'metric_cls',
  si: 'metric_speed_index',
  tti: 'metric_tti',
}

// * An em dash, never a zero. A metric Lighthouse did not produce is not a
// * measurement of zero — that conflation is what made five months of stored
// * history untrustworthy.
function formatMetricValue(metric: string, value: number | null): string {
  if (value === null) return '—'
  if (metric === 'cls') return value.toFixed(3)
  if (value < 1000) return `${Math.round(value)}ms`
  return `${(value / 1000).toFixed(1)}s`
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

// * The check navigator's compact stamp is formatSiteStampShort — the status
// * line above carries the full zone-labelled one, so this stays terse.

export default function PerformancePage() {
  const canEdit = useCan('pagespeed.manage')
  const params = useParams()
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()
  const siteId = params.id as string

  // * ?strategy= — mobile is the default and is kept OUT of the URL, matching
  // * the ?engine= convention on the Search page.
  const strategy: Strategy = searchParams.get('strategy') === 'desktop' ? 'desktop' : 'mobile'

  const { data: site } = useSite(siteId)
  const { data: config, error: configError, isLoading: configLoading, mutate: mutateConfig } = usePerformanceConfig(siteId)
  const { data: latest, error: latestError, isLoading: latestLoading, mutate: mutateLatest } = usePerformanceLatest(siteId)

  const [running, setRunning] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [frequency, setFrequency] = useState<string>('weekly')

  const { data: historyChecks, error: historyError, mutate: mutateHistory } = usePerformanceHistory(siteId, strategy)

  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
  const [selectedCheckData, setSelectedCheckData] = useState<PerformanceCheck | null>(null)
  const [loadingCheck, setLoadingCheck] = useState(false)
  const [checkFetchFailed, setCheckFetchFailed] = useState(false)

  const setStrategy = useCallback(
    (next: Strategy) => {
      write({ strategy: next === 'mobile' ? null : next })
      setSelectedCheckId(null)
      setSelectedCheckData(null)
      setCheckFetchFailed(false)
    },
    [write],
  )

  const latestForStrategy = latest?.checks.find(c => c.strategy === strategy) ?? null
  const attemptForStrategy = latest?.attempts.find(a => a.strategy === strategy) ?? null

  // * The check timeline for the visible strategy. History returns only
  // * successful checks, so this navigates between checks that HAVE numbers.
  const checkTimeline = useMemo(() => {
    if (!historyChecks?.length) return [] as { id: string; checked_at: string }[]
    // * ⚠️ keepPreviousData means historyChecks is briefly the OTHER strategy's
    // * data straight after a tab switch. Navigating that timeline would fetch a
    // * mobile check and render it under the Desktop tab, and then wedge at
    // * selectedIndex === -1 once the real data arrived and the id was no longer
    // * in the list. Only navigate a timeline that belongs to the visible tab.
    if (historyChecks[0]?.strategy !== strategy) return [] as { id: string; checked_at: string }[]
    return [...historyChecks]
      .sort((a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime())
      .map(c => ({ id: c.id, checked_at: c.checked_at }))
  }, [historyChecks, strategy])

  // * The navigator mixes two independent sources: the DISPLAYED check comes
  // * from `latest`, the index space comes from `history`, and they are separate
  // * SWR keys. Straight after a manual check completes we mutate `latest`, so
  // * for up to one history refresh interval the timeline is exactly one row
  // * behind — and index 0 is then NOT the displayed check.
  // *
  // * Assuming it was (`selectedCheckId ? findIndex(...) : 0`) made "Previous
  // * check" step to timeline[1] and SKIP timeline[0] entirely: the check the
  // * user actually wanted was unreachable by any button until the next refresh.
  // * Reconciling by ID removes the assumption. -1 is meaningful here — it means
  // * "the displayed check is newer than everything in the timeline", and
  // * goToCheck(0) is then correctly the previous one.
  const displayedCheckId = selectedCheckId ?? latestForStrategy?.id ?? null
  const selectedIndex = displayedCheckId ? checkTimeline.findIndex(t => t.id === displayedCheckId) : -1
  // * Is the newest check we can DISPLAY newer than everything the timeline
  // * knows about? That is the whole lagging-history case: after a manual run
  // * `latest` has the new check and `history` has not caught up.
  const latestIsNewerThanTimeline =
    latestForStrategy != null && checkTimeline.length > 0 && checkTimeline[0].id !== latestForStrategy.id
  const canGoPrev = checkTimeline.length > 0 && selectedIndex < checkTimeline.length - 1
  // * index -1 is "showing something newer than the timeline", so stepping
  // * FORWARD from index 0 has somewhere to go precisely when that is true.
  // * Without the second clause a user who stepped back one check while the
  // * timeline lagged could never return to the latest one — the arrow was
  // * disabled and goToCheck(-1) fell off the end of the array.
  const canGoNext = selectedIndex > 0 || (selectedIndex === 0 && latestIsNewerThanTimeline)

  const goToCheck = (index: number) => {
    // * Negative index means the latest check, which by definition is not in the
    // * timeline when the timeline is stale.
    if (index < 0) {
      if (!latestIsNewerThanTimeline) return
      setCheckFetchFailed(false)
      setSelectedCheckId(null)
      setSelectedCheckData(null)
      return
    }
    const target = checkTimeline[index]
    if (!target) return
    setCheckFetchFailed(false)
    // * Selecting the check that IS the latest returns to the un-selected state,
    // * so the page renders `latest` (which carries the blobs) rather than
    // * re-fetching the same row. Keyed on identity, not on index 0 — after a
    // * manual run the newest timeline entry is not the latest check.
    if (target.id === latestForStrategy?.id) {
      setSelectedCheckId(null)
      setSelectedCheckData(null)
      return
    }
    setSelectedCheckId(target.id)
  }

  // * Retry does NOT fetch. It bumps a nonce the effect below depends on, so the
  // * single already-cancellable effect owns every request for a check.
  // *
  // * It used to fire its own unguarded promise. That request and the effect's
  // * could be in flight together and resolve in either order, so: fail on check
  // * X, click "Try again", then click "Previous check" (which selects Y and
  // * starts the effect's fetch) — Y resolves and renders, then X's retry
  // * resolves and overwrites it. The page then showed check X's scores and
  // * timestamp while the navigator arrows were computed from Y's index, with no
  // * spinner left to suggest anything was in flight.
  const [retryNonce, setRetryNonce] = useState(0)
  const retryCheckFetch = useCallback(() => {
    setRetryNonce(n => n + 1)
  }, [])

  useEffect(() => {
    if (!selectedCheckId || !siteId) {
      setSelectedCheckData(null)
      setCheckFetchFailed(false)
      return
    }
    let cancelled = false
    setLoadingCheck(true)
    setCheckFetchFailed(false)
    getPerformanceCheck(siteId, selectedCheckId)
      .then(data => {
        if (cancelled) return
        setSelectedCheckData(data)
        setLoadingCheck(false)
      })
      .catch(() => {
        if (cancelled) return
        // * The failure is SURFACED, not swallowed. Previously this cleared the
        // * spinner and let displayCheck silently fall back to the latest check —
        // * so the page showed today's numbers under the historical date the
        // * user had selected.
        setCheckFetchFailed(true)
        setLoadingCheck(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCheckId, siteId, retryNonce])

  // * When a historical fetch fails we render NOTHING for the check body rather
  // * than substituting the latest one under the wrong timestamp.
  const currentCheck: PerformanceCheck | null = selectedCheckId
    ? checkFetchFailed
      ? null
      : selectedCheckData
    : latestForStrategy

  useEffect(() => {
    if (site?.domain) document.title = `Performance · ${site.domain} | Pulse`
  }, [site?.domain])

  useEffect(() => {
    if (config?.frequency) setFrequency(config.frequency)
  }, [config?.frequency])

  const handleToggle = async (enabled: boolean) => {
    setToggling(true)
    try {
      await updatePerformanceConfig(siteId, { enabled, frequency })
      mutateConfig()
      mutateLatest()
      void mutateHistory()
      toast.success(enabled ? 'Performance monitoring enabled' : 'Performance monitoring disabled')
    } catch {
      toast.error('Failed to update performance monitoring')
    } finally {
      setToggling(false)
    }
  }

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])
  useEffect(() => () => stopPolling(), [stopPolling])

  const handleRunCheck = useCallback(async () => {
    setRunning(true)
    try {
      await triggerPerformanceCheck(siteId)
      toast.success('Performance check started — three runs per device, so this takes a few minutes')

      const initialAttempt = latest?.attempts.find(a => a.strategy === strategy)?.checked_at
      const startedAt = Date.now()

      stopPolling()
      pollRef.current = setInterval(async () => {
        // * A check is now three runs per strategy. The old 2-minute ceiling
        // * expired before the work could possibly finish and told the user it
        // * had "taken longer than expected" every single time.
        if (Date.now() - startedAt > 12 * 60_000) {
          stopPolling()
          setRunning(false)
          toast.error('Check is taking longer than expected. Results will appear when ready.')
          return
        }
        try {
          const fresh = await getPerformanceLatest(siteId)
          const freshAttempt = fresh?.attempts.find(a => a.strategy === strategy)
          if (freshAttempt && freshAttempt.checked_at !== initialAttempt) {
            stopPolling()
            setRunning(false)
            // * BOTH sources. They are separate SWR keys, and refreshing only
            // * `latest` leaves the check navigator's index space one row behind
            // * until the history hook's own interval fires — during which the
            // * newest historical check is unreachable by any button.
            mutateLatest()
            void mutateHistory()
            // * A new ATTEMPT is not the same thing as a new RESULT. An error
            // * row also lands here, and reporting "check complete" over a
            // * failure is the same silent-success the status line exists to
            // * stop — the customer would get a green toast and then wonder why
            // * the numbers did not move.
            if (freshAttempt.status === 'error') {
              toast.error(
                freshAttempt.error
                  ? `Performance check failed — ${freshAttempt.error}`
                  : 'Performance check failed',
              )
            } else {
              toast.success('Performance check complete')
            }
          }
        } catch {
          // * Silent — keep polling. A transient poll failure is not the check failing.
        }
      }, 5000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start check'
      toast.error(message)
      setRunning(false)
    }
  }, [siteId, strategy, latest, mutateLatest, mutateHistory, stopPolling])

  // * Hold the skeleton until BOTH requests have landed. `!config && !latest`
  // * clears as soon as EITHER arrives, and the two states that read off the
  // * missing one are the confident-but-wrong ones: an established site flashes
  // * "monitoring is off" (config still in flight) or "First check queued"
  // * (latest still in flight) before the real page appears.
  const showSkeleton = useMinimumLoading((configLoading || latestLoading) && (!config || !latest))
  if (showSkeleton) return <PerformanceSkeleton />
  if (!site) return <div className="p-8 text-neutral-500">Site not found</div>

  // ── State: the config request FAILED ──────────────────────────────────────
  // This must never be confused with "monitoring is disabled". `config?.enabled
  // ?? false` used to collapse the two, so a 500 on the settings endpoint
  // rendered a confident "Performance monitoring is disabled" screen complete with
  // an Enable button, for a site where it was switched on.
  if (configError && !config) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <PageHeader domain={site.domain} frequency={null} />
        <ErrorCard
          title="Couldn't load performance settings"
          description="The settings request failed, so we can't tell whether monitoring is on. Your checks are unaffected — this is a loading problem."
          onRetry={() => {
            void mutateConfig()
          }}
        />
      </div>
    )
  }

  // * How many history rows the trend chart can actually plot — the same filter
  // * PerformanceTrend applies internally.
  const scoredHistoryCount = historyChecks?.filter(c => c.performance_score !== null).length ?? 0

  const enabled = config?.enabled ?? false

  // ── State: not configured ─────────────────────────────────────────────────
  if (!enabled) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <PageHeader domain={site.domain} frequency={null} />
        <div className={`${CARD} p-6 text-center md:p-12`}>
          <h3 className="mb-2 font-semibold text-white">Performance monitoring is off</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-neutral-400">
            Turn it on to run Lighthouse against {site.domain} on a schedule and track how the scores move.
            Each check is the median of three runs, so the trend reflects the page rather than run-to-run noise.
          </p>
          <div className="mb-6 flex items-center justify-center gap-3">
            <label className="text-sm text-neutral-400" htmlFor="pagespeed-frequency">
              Check frequency
            </label>
            <Select
              variant="input"
              className="min-w-[120px]"
              value={frequency}
              onChange={value => setFrequency(value)}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          </div>
          {canEdit && (
            <Button onClick={() => handleToggle(true)} disabled={toggling}>
              {toggling ? 'Enabling…' : 'Enable performance monitoring'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  const audits = currentCheck?.audits ?? []
  const passed = audits.filter(a => a.category === 'passed')

  const categoryGroups = [
    { key: 'performance', label: 'Performance' },
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'best-practices', label: 'Best Practices' },
    { key: 'seo', label: 'SEO' },
  ]

  const auditsByGroup: Record<string, AuditSummary[]> = {}
  const manualByGroup: Record<string, AuditSummary[]> = {}
  for (const group of categoryGroups) {
    auditsByGroup[group.key] = audits
      .filter(a => a.category !== 'passed' && a.category !== 'manual' && a.group === group.key)
      .sort((a, b) => {
        if (a.category === 'opportunity' && b.category !== 'opportunity') return -1
        if (a.category !== 'opportunity' && b.category === 'opportunity') return 1
        if (a.category === 'opportunity' && b.category === 'opportunity') {
          return (b.savings_ms ?? 0) - (a.savings_ms ?? 0)
        }
        return 0
      })
    manualByGroup[group.key] = audits.filter(a => a.category === 'manual' && a.group === group.key)
  }

  const metrics = [
    { key: 'fcp', label: 'First Contentful Paint', value: currentCheck?.fcp_ms ?? null },
    { key: 'lcp', label: 'Largest Contentful Paint', value: currentCheck?.lcp_ms ?? null },
    { key: 'tbt', label: 'Total Blocking Time', value: currentCheck?.tbt_ms ?? null },
    { key: 'cls', label: 'Cumulative Layout Shift', value: currentCheck?.cls ?? null },
    { key: 'si', label: 'Speed Index', value: currentCheck?.si_ms ?? null },
    { key: 'tti', label: 'Time to Interactive', value: currentCheck?.tti_ms ?? null },
  ]

  const allScores = [
    { key: 'performance', label: 'Performance', score: currentCheck?.performance_score ?? null },
    { key: 'accessibility', label: 'Accessibility', score: currentCheck?.accessibility_score ?? null },
    { key: 'best-practices', label: 'Best Practices', score: currentCheck?.best_practices_score ?? null },
    { key: 'seo', label: 'SEO', score: currentCheck?.seo_score ?? null },
  ]

  const scoreByGroup: Record<string, number | null> = {
    performance: currentCheck?.performance_score ?? null,
    accessibility: currentCheck?.accessibility_score ?? null,
    'best-practices': currentCheck?.best_practices_score ?? null,
    seo: currentCheck?.seo_score ?? null,
  }

  const lcpMs = currentCheck?.lcp_ms ?? null
  const noChecksYet = (latest?.attempts.length ?? 0) === 0

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <PageHeader domain={site.domain} frequency={config?.frequency ?? null} />
          <PerformanceStatusLine
            attempt={attemptForStrategy}
            displayed={latestForStrategy}
            nextCheckAt={config?.next_check_at ?? null}
            onRunCheck={canEdit ? handleRunCheck : undefined}
            runInFlight={running}
            timezone={site.timezone ?? null}
          />
        </div>

        {/* flex-wrap, and NOT flex-shrink-0 below sm. At 375 px this row holds the
            two tabs plus Run Check plus Disable, which is wider than the
            container — flex-shrink-0 meant it could neither shrink nor wrap and
            it overflowed by 5 px, which the shell's overflow-x-hidden then CUT
            rather than scrolled.
            ⚠️ It was invisible in the local render harness because both buttons
            are gated on useCan('pagespeed.manage'), and the harness has no real
            auth — so the row it measured was missing exactly the elements that
            overflow. Authed geometry has to be checked in an authed browser. */}
        <div className="flex flex-wrap items-center gap-3 sm:flex-shrink-0">
          {/* The page's own switcher, kept verbatim: text tabs with a motion
              underline, not a boxed segmented control. */}
          <div className="flex gap-1" role="tablist" aria-label="Strategy">
            {(['mobile', 'desktop'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStrategy(tab)}
                role="tab"
                aria-selected={strategy === tab}
                className={`relative cursor-pointer rounded-none px-3 py-1.5 text-sm font-medium transition-colors ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${
                  strategy === tab ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {tab === 'mobile' ? 'Mobile' : 'Desktop'}
                {strategy === tab && (
                  <motion.div
                    layoutId="pagespeedStrategyTab"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-orange"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>

          {canEdit && (
            <>
              <Button size="toolbar" onClick={handleRunCheck} isLoading={running}>
                {running ? 'Running…' : 'Run Check'}
              </Button>
              <Button variant="chrome" size="toolbar" onClick={() => handleToggle(false)} isLoading={toggling}>
                Disable
              </Button>
            </>
          )}
        </div>
      </div>

      {latestError && !latest ? (
        <ErrorCard
          title="Couldn't load the latest check"
          description="The request failed. Your scheduled checks are unaffected — this is a loading problem."
          onRetry={() => {
            void mutateLatest()
          }}
        />
      ) : noChecksYet ? (
        <div className={`${CARD} p-6 text-center md:p-12`}>
          <h3 className="mb-2 font-semibold text-white">First check queued</h3>
          <p className="mx-auto max-w-md text-sm text-neutral-400">
            Results appear within a few minutes. Each check runs Lighthouse three times per device and stores the
            median.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {/* ── Hero: scores + screenshot + check navigator ── */}
          <div className={`${CARD} p-6 sm:p-8`}>
            {checkFetchFailed ? (
              <div className="py-6 text-center">
                <p className="text-sm text-red-400">Couldn&apos;t load that check.</p>
                <button
                  type="button"
                  onClick={retryCheckFetch}
                  className="mt-2 text-xs text-red-300 underline-offset-2 transition-colors ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                {/* 🔑 THE HIERARCHY HAS TO BE SAID OUT LOUD, because the page is
                    called Performance and one of the four gauges below is ALSO
                    called Performance. That is Lighthouse's category name, not
                    ours, so the gauge keeps it — this label is what stops the
                    same word at two levels from reading as the same thing. Every
                    other section on this page already carries a SECTION_LABEL;
                    the hero was the one that did not. */}
                <h3 className={`${SECTION_LABEL} mb-5`}>Category scores</h3>
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:flex-wrap sm:justify-between">
                {/* A GRID below sm, a flex row above it. Left as a wrapping flex
                    row, the four gauges go 4×1 at 375 px, because "Best
                    Practices" sets a ~100 px minimum per item and two of those
                    plus the gap no longer fit beside the screenshot. A 2-column
                    grid gets the 2×2 the design calls for regardless of how long
                    a label happens to be. */}
                <div className="grid w-full min-w-0 grid-cols-2 gap-y-6 sm:flex sm:w-auto sm:flex-1 sm:flex-wrap sm:items-center sm:justify-center sm:gap-10">
                  {allScores.map(({ key, label, score }) => (
                    <button
                      key={key}
                      onClick={() =>
                        document.getElementById(`diag-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                      // The canonical sentence, reachable by screen readers without a
                      // control nested inside this button — the sighted equivalent is
                      // the one glyph on this same term's accordion heading below.
                      aria-describedby={`pagespeed-score-def-${key}`}
                      className="cursor-pointer transition-opacity ease-apple hover:opacity-80"
                    >
                      <ScoreGauge score={score} label={label} size={92} />
                      <span id={`pagespeed-score-def-${key}`} className="sr-only">
                        {TERMS[SCORE_TERM[key]]?.definition}
                      </span>
                    </button>
                  ))}
                </div>
                {currentCheck?.screenshot && (
                  <img
                    src={currentCheck.screenshot}
                    alt={`${strategy} render of ${site.domain}`}
                    className="h-auto w-24 flex-none rounded-none border border-border object-contain"
                  />
                )}
              </div>
              </>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-neutral-400">
                {checkTimeline.length > 1 && (
                  <button
                    onClick={() => goToCheck(selectedIndex + 1)}
                    disabled={!canGoPrev}
                    className="rounded-none p-1 transition-colors ease-apple hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Previous check"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                {currentCheck?.checked_at ? (
                  <span className="tabular-nums text-neutral-200">{formatSiteStampShort(currentCheck.checked_at, site.timezone)}</span>
                ) : (
                  <span className="text-neutral-500">—</span>
                )}
                {checkTimeline.length > 1 && (
                  <button
                    onClick={() => goToCheck(selectedIndex - 1)}
                    disabled={!canGoNext}
                    className="rounded-none p-1 transition-colors ease-apple hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Next check"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                {config?.frequency && <Chip>{config.frequency}</Chip>}
                {/* The provenance chip reads the row, never a constant: a
                    pre-cutover check really was a single run and must not be
                    labelled "median of 3". The glyph only applies to the
                    median case — a single-run chip has no methodology to explain. */}
                {currentCheck && (
                  <Chip>
                    {currentCheck.runs ? `median of ${currentCheck.runs}` : 'single run'}
                    {/* -my-1 keeps the 24px hit target from making this chip
                        taller than the frequency chip sitting next to it. */}
                    {currentCheck.runs ? <TermInfoTip term="median_of_three" className="-my-1" /> : null}
                  </Chip>
                )}
                {loadingCheck && <span className="text-xs text-neutral-500">Loading…</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-caption text-neutral-500">
                <LegendSwatch color="#ff4e42" label="0–49" />
                <LegendSwatch color="#ffa400" label="50–89" />
                <LegendSwatch color="#0cce6b" label="90–100" />
              </div>
            </div>
          </div>

          {/* ── Filmstrip ── */}
          {currentCheck?.filmstrip && currentCheck.filmstrip.length > 0 && (
            <div className={`${CARD} p-6 sm:p-8`}>
              <h3 className={`${SECTION_LABEL} mb-4 flex items-center gap-1`}>
                Page load timeline
                <TermInfoTip term="check_imagery_retention" />
              </h3>
              {/* min-w-0 so the strip scrolls inside its own box instead of
                  forcing the app shell to scroll — the shell's overflow-x-hidden
                  DELETES clipped content rather than revealing it. */}
              <div className="flex min-w-0 items-start gap-2.5 overflow-x-auto pb-1">
                {currentCheck.filmstrip.map((frame, idx) => (
                  <div key={idx} className="flex-none text-center">
                    {/* 🔴 FIX THE HEIGHT, LET THE WIDTH FOLLOW THE IMAGE.
                        This was `h-28 w-16` — a hardcoded 112x64 PORTRAIT box with
                        object-cover, which crops to fill. Measured from production
                        rows: a desktop filmstrip frame is 500x348 (aspect 1.44,
                        LANDSCAPE) and a mobile one is 250x498 (aspect 0.50). So the
                        desktop timeline was having ~60% of its WIDTH cropped away —
                        the hero heading rendered as "ata is yours." with both edges
                        gone, on the one panel whose entire job is showing what the
                        page looked like as it loaded.
                        w-auto derives the box from the image instead of asserting a
                        device shape, so it is correct for both strategies with no
                        branching and stays correct if Lighthouse's viewport presets
                        ever change. */}
                    <img
                      src={frame.data}
                      alt=""
                      className="block h-28 w-auto rounded-none border border-border"
                    />
                    <div className="mt-1 text-micro-label tabular-nums text-neutral-500">{formatMs(frame.timing)}</div>
                  </div>
                ))}
                {lcpMs !== null && (
                  <div className="flex-none self-center border-l border-red-500 pl-2 text-xs text-neutral-500">
                    LCP lands
                    <br />
                    <span className="font-semibold tabular-nums text-neutral-200">{formatMs(lcpMs)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Metrics ── */}
          <div className={`${CARD} p-6 sm:p-8`}>
            <h3 className={`${SECTION_LABEL} mb-5`}>Metrics</h3>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map(({ key, label, value }) => (
                <div key={key} className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-1.5 inline-block h-2.5 w-2.5 flex-none rounded-full ${BAND_DOT[metricBand(key, value)]}`}
                  />
                  <div className="min-w-0">
                    {/* h-5 = the un-glyphed line height. Only four of the six
                        metrics carry a glyph, so without it the four glyphed
                        cells grow 4px and their values sit off the grid row's
                        baseline against the two bare ones. */}
                    <div className="flex h-5 items-center gap-1 text-sm text-neutral-400">
                      {label}
                      {METRIC_TERM[key] && <TermInfoTip term={METRIC_TERM[key]!} />}
                    </div>
                    <div className="text-2xl font-semibold tabular-nums text-white">
                      {formatMetricValue(key, value)}
                    </div>
                    <div className="text-caption text-neutral-500">good {METRIC_GOOD_LABEL[key]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Trend ── */}
          {historyError && !historyChecks ? (
            <ErrorCard
              title="Couldn't load the score history"
              description="The trend request failed. The latest check above is unaffected."
            />
          ) : (
            // * Gate on SCORED checks, not on rows. PerformanceTrend filters to
            // * performance_score !== null and renders nothing below two points,
            // * and the two conditions are not the same set: a status='ok' row
            // * can carry a NULL performance score, because categoryScore returns
            // * nil when the performance category is absent or unscored while the
            // * check itself still succeeds. A site whose page never stabilises
            // * (an NO_LCP-class result) therefore accumulated ok rows with no
            // * score, the card mounted, the chart returned null, and the user
            // * got a bordered box containing a heading and nothing else on every
            // * load.
            scoredHistoryCount >= 2 && (
              <div className={`${CARD} p-6 sm:p-8`}>
                <h3 className={`${SECTION_LABEL} mb-4`}>Performance score trend</h3>
                <PerformanceTrend checks={historyChecks ?? []} timezone={site.timezone ?? null} />
              </div>
            )
          )}

          {/* ── Category accordions ── */}
          {audits.length > 0 &&
            categoryGroups.map(group => {
              const groupAudits = auditsByGroup[group.key] ?? []
              const groupPassed = passed.filter(a => a.group === group.key)
              const groupManual = manualByGroup[group.key] ?? []
              if (groupAudits.length === 0 && groupPassed.length === 0 && groupManual.length === 0) return null
              const realIssues = groupAudits.filter(a => a.score !== null && a.score !== undefined).length
              return (
                <div key={group.key} id={`diag-${group.key}`} className={`${CARD} scroll-mt-6 p-6 sm:p-8`}>
                  <div className="mb-5 flex items-center gap-4">
                    <ScoreGauge score={scoreByGroup[group.key]} label="" size={40} />
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-1 font-semibold text-white">
                        {group.label}
                        <TermInfoTip term={SCORE_TERM[group.key]} />
                      </h3>
                      <p className="text-xs text-neutral-500">
                        {realIssues === 0 ? 'No issues found' : `${realIssues} issue${realIssues !== 1 ? 's' : ''} found`}
                      </p>
                    </div>
                  </div>

                  {groupAudits.length > 0 && <AuditsBySubGroup audits={groupAudits} />}

                  {groupManual.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer select-none text-sm font-medium text-neutral-400 transition-colors ease-apple hover:text-neutral-300">
                        <span className="ml-1">Additional items to manually check ({groupManual.length})</span>
                      </summary>
                      <div className="mt-2 divide-y divide-border">
                        {groupManual.map(audit => (
                          <AuditRow key={audit.id} audit={audit} />
                        ))}
                      </div>
                    </details>
                  )}

                  {groupPassed.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer select-none text-sm font-medium text-neutral-400 transition-colors ease-apple hover:text-neutral-300">
                        <span className="ml-1">
                          {groupPassed.length} passed audit{groupPassed.length !== 1 ? 's' : ''}
                        </span>
                      </summary>
                      <div className="mt-2 divide-y divide-border">
                        {groupPassed.map(audit => (
                          <AuditRow key={audit.id} audit={audit} />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )
            })}

          {/* ── Spec plate ── */}
          <SpecPlate domain={site.domain} check={currentCheck} attempt={attemptForStrategy} />
        </div>
      )}
    </div>
  )
}

function PageHeader({ domain, frequency }: { domain: string; frequency: string | null }) {
  // * "Lab" is load-bearing, and "Core Web Vitals" is gone. These are Lighthouse
  // * lab measurements from our own runner; CrUX field data was probed live for
  // * every site on the platform and came back EMPTY for all of them, so the old
  // * copy promised something the page has never once shown.
  const cadence = frequency ? `checked ${frequency}` : 'checked on a schedule'
  return (
    <div>
      <h1 className="flex items-center gap-1 text-lg font-semibold text-white">
        Performance
        <TermInfoTip term="check_provenance" />
      </h1>
      <p className="mt-1 text-sm text-neutral-400">
        Lab performance scores for {domain} — {cadence}, mobile and desktop.
      </p>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-none border border-border px-2 py-0.5 text-xs text-neutral-400">
      {children}
    </span>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

// * The spec plate: what produced these numbers. Mono here is correct — a URL, a
// * version string and an engine name are machine data, not chrome.
function SpecPlate({
  domain,
  check,
  attempt,
}: {
  domain: string
  check: PerformanceCheck | null
  attempt: { lighthouse_version: string | null; source: string } | null
}) {
  const version = check?.lighthouse_version ?? attempt?.lighthouse_version ?? null
  const source = check?.source ?? attempt?.source ?? null
  const engine =
    source === 'lighthouse'
      ? `lighthouse ${version ?? 'unknown'} (pinned)`
      : source === 'psi'
        ? 'pagespeed insights (version not recorded)'
        : null
  const runs = check?.runs ? `median of ${check.runs} runs` : check ? 'single run' : null

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border pt-3 text-caption text-neutral-500">
      <span className="min-w-0 break-all font-mono">
        {[`https://${domain}`, engine, runs].filter(Boolean).join(' · ')}
      </span>
      <span>times are site time</span>
    </div>
  )
}

function sortBySeverity(audits: AuditSummary[]): AuditSummary[] {
  return [...audits].sort((a, b) => {
    const rank = (s: number | null | undefined) => {
      if (s === null || s === undefined) return 2
      if (s < 0.5) return 0
      if (s < 0.9) return 1
      return 3
    }
    return rank(a.score) - rank(b.score)
  })
}

const subGroupPriority: Record<string, number> = {
  budgets: 0,
  'load-opportunities': 0,
  diagnostics: 1,
  'a11y-names-labels': 0,
  'a11y-contrast': 1,
  'a11y-best-practices': 2,
  'a11y-color-contrast': 1,
  'a11y-aria': 3,
  'a11y-navigation': 4,
  'a11y-language': 5,
  'a11y-audio-video': 6,
  'a11y-tables-lists': 7,
  'seo-mobile': 0,
  'seo-content': 1,
  'seo-crawl': 2,
}

function AuditsBySubGroup({ audits }: { audits: AuditSummary[] }) {
  const bySubGroup: Record<string, AuditSummary[]> = {}
  for (const audit of audits) {
    const key = audit.sub_group || '__none__'
    if (!bySubGroup[key]) bySubGroup[key] = []
    bySubGroup[key].push(audit)
  }

  const subGroupOrder = Object.keys(bySubGroup).sort(
    (a, b) => (subGroupPriority[a] ?? 0) - (subGroupPriority[b] ?? 0),
  )

  if (subGroupOrder.length === 1 && subGroupOrder[0] === '__none__') {
    return (
      <div className="divide-y divide-border">
        {sortBySeverity(audits).map(audit => (
          <AuditRow key={audit.id} audit={audit} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {subGroupOrder.map(key => {
        const items = sortBySeverity(bySubGroup[key])
        const title = items[0]?.sub_group_title
        return (
          <div key={key}>
            {title && (
              <h4 className="mb-2 text-caption font-semibold uppercase tracking-wider text-neutral-500">{title}</h4>
            )}
            <div className="divide-y divide-border">
              {items.map(audit => (
                <AuditRow key={audit.id} audit={audit} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AuditSeverityIcon({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 flex-none rounded-full border-2 border-neutral-500"
        aria-label="Informative"
      />
    )
  }
  if (score < 0.5) return <span className="inline-block h-2.5 w-2.5 flex-none rounded-full bg-red-500" aria-label="Poor" />
  if (score < 0.9)
    return <span className="inline-block h-2.5 w-2.5 flex-none rounded-full bg-amber-500" aria-label="Needs improvement" />
  return <span className="inline-block h-2.5 w-2.5 flex-none rounded-full bg-emerald-500" aria-label="Good" />
}

function AuditRow({ audit }: { audit: AuditSummary }) {
  // * Description prose comes from the bundled catalogue, not the stored row.
  // * A null here means this Lighthouse version has no entry for the id, which
  // * is the correct degradation for a check from an older engine — better a
  // * title alone than another version's guidance attributed to this run.
  const description = auditDescription(audit.id)
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-none px-2 py-3 hover:bg-neutral-800/50">
        <AuditSeverityIcon score={audit.score} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{audit.title}</span>
        {audit.display_value && (
          <span className="flex-none tabular-nums text-xs text-neutral-500">{audit.display_value}</span>
        )}
        {audit.savings_ms != null && audit.savings_ms > 0 && !audit.display_value && (
          <span className="flex-none tabular-nums text-sm font-medium text-amber-400">
            {formatMs(audit.savings_ms)}
          </span>
        )}
        <svg
          className="h-4 w-4 flex-none text-neutral-500 transition-transform ease-apple group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="pb-3 pl-8 pr-2 pt-1">
        {description && (
          <p className="mb-3 text-xs leading-relaxed text-neutral-400">
            <AuditDescription text={description} />
          </p>
        )}
        {audit.details && Array.isArray(audit.details) && audit.details.length > 0 && (
          <div className="space-y-2">
            {audit.details.slice(0, 10).map((item, idx) => (
              <AuditItem key={idx} item={item} />
            ))}
            {audit.details.length > 10 && (
              <p className="mt-1 text-xs text-neutral-500">+ {audit.details.length - 10} more items</p>
            )}
          </div>
        )}
      </div>
    </details>
  )
}

// * Renders Lighthouse's own markdown: [text](url) links, remapped to our
// * /learn articles where we have one, and `code` spans. The backticks are real
// * markdown in the source strings — PSI's renderer used to strip them before we
// * ever saw them, so they are new here, and they wrap identifiers like
// * `offsetWidth`, which is exactly what font-mono is FOR.
function AuditDescription({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          const href = remapLearnUrl(link[2])
          const isInternal =
            href.startsWith('https://ciphera.net') ||
            href.startsWith('https://pulse.ciphera.net') ||
            href.startsWith('https://pulse-staging.ciphera.net')
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel={isInternal ? 'noopener' : 'noopener noreferrer'}
              className="text-brand-orange hover:underline"
            >
              {link[1]}
            </a>
          )
        }
        const code = part.match(/^`([^`]+)`$/)
        if (code) {
          return (
            <code key={i} className="rounded-none bg-neutral-800 px-1 py-0.5 font-mono text-[0.95em] text-neutral-300">
              {code[1]}
            </code>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function AuditItem({ item }: { item: Record<string, unknown> }) {
  const node = item.node as Record<string, unknown> | undefined
  const source = item.source as Record<string, unknown> | undefined
  const label =
    (node?.nodeLabel as string) || (item.label as string) || (item.groupLabel as string) || (source?.url as string) || null
  const url = (item.url as string) || (item.href as string) || null
  const text = (item.text as string) || (item.linkText as string) || null
  const screenshot = (node?.screenshot as Record<string, unknown> | undefined)?.data as string | undefined
  const wastedBytes = item.wastedBytes as number | undefined
  const totalBytes = item.totalBytes as number | undefined
  const wastedMs = item.wastedMs as number | undefined

  const bytes = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KiB`)

  return (
    <div className="flex items-start gap-3 border-b border-border py-2 text-xs text-neutral-400 last:border-0">
      {screenshot && (
        <img
          src={screenshot}
          alt=""
          className="h-14 w-20 flex-none rounded-none border border-border object-contain"
        />
      )}
      <div className="min-w-0 flex-1">
        {label && <div className="mb-0.5 text-xs font-medium text-white">{label}</div>}
        {url && <div className="break-all font-mono text-xs text-neutral-500">{url}</div>}
        {text && <div className="mt-0.5 text-xs text-neutral-400">{text}</div>}
        {typeof node?.snippet === 'string' && (
          <code className="mt-1 inline-block break-all rounded-none bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">
            {node.snippet}
          </code>
        )}
      </div>
      <div className="flex-none space-y-0.5 text-right tabular-nums">
        {wastedBytes != null && <div className="whitespace-nowrap text-amber-400">{bytes(wastedBytes)}</div>}
        {totalBytes != null && wastedBytes == null && <div className="whitespace-nowrap">{bytes(totalBytes)}</div>}
        {wastedMs != null && <div className="whitespace-nowrap text-amber-400">{formatMs(wastedMs)}</div>}
      </div>
    </div>
  )
}

function PerformanceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse px-4 pb-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-36 bg-neutral-800" />
          <div className="h-4 w-80 bg-neutral-800" />
          <div className="h-3 w-56 bg-neutral-800" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-16 bg-neutral-800" />
          <div className="h-8 w-20 bg-neutral-800" />
          <div className="h-9 w-24 bg-neutral-800" />
        </div>
      </div>

      <div className="grid gap-4">
        <div className={`${CARD} p-6 sm:p-8`}>
          <div className="flex flex-wrap items-center justify-center gap-10">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-[92px] w-[92px] rounded-full border-[5px] border-neutral-800" />
                <div className="h-3 w-16 bg-neutral-800" />
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-4 border-t border-border pt-4">
            <div className="h-3 w-40 bg-neutral-800" />
            <div className="ml-auto h-2 w-32 bg-neutral-800" />
          </div>
        </div>

        <div className={`${CARD} p-6 sm:p-8`}>
          <div className="mb-5 h-3 w-16 bg-neutral-800" />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-neutral-800" />
                <div className="space-y-2">
                  <div className="h-3 w-32 bg-neutral-800" />
                  <div className="h-7 w-20 bg-neutral-800" />
                  <div className="h-2 w-16 bg-neutral-800" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${CARD} p-6 sm:p-8`}>
          <div className="mb-5 h-3 w-40 bg-neutral-800" />
          <div className="h-48 w-full bg-neutral-800/60" />
        </div>
      </div>
    </div>
  )
}
