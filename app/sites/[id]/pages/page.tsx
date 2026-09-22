'use client'

import { useParams } from 'next/navigation'
import DateRangePicker from '@/components/ui/DateRangePicker'
import PagesTable from '@/components/pages/PagesTable'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { fetchableRange } from '@/lib/dashboard/resolveRange'
import { useSite, usePagesTable } from '@/lib/swr/dashboard'
import { siteDaysCaption } from '@/lib/utils/timezones'

// ---------------------------------------------------------------------------
// The Pages surface (PULSE-18). Design + two options rounds:
// docs/plans/22-09-2026-pages-surface-design.md
//
// Why this exists: the dashboard's Pages card shows SEVEN rows. Production's
// busiest site has 520 distinct paths and only 49.3% of its pageviews in the
// top ten, so roughly half that site's traffic had no surface at all. The
// browsable set is ~123 pages there — far past a card, and small enough for one
// searchable table.
//
// P1 is deliberately TABLE ONLY (owner, 22-09-2026): rows do not open a detail
// view yet. Worth knowing that every competitor gets this wrong too — Rybbit's
// dedicated Pages rows have no click handler at all, OpenPanel's only work if
// you connect Search Console, and PostHog's per-page report is a dead-end you
// paste a URL into.
//
// ⚠️ DEFERRED, NOT FORGOTTEN: the dashboard filter bar. Every other analytics
// tab carries one and the endpoint already accepts `filters`, so this is purely
// the UI half. It is left out of P1 to keep the first cut reviewable rather than
// half-wiring the filter popover's state. Adding it is additive.
// ---------------------------------------------------------------------------

export default function PagesPage() {
  const params = useParams()
  const siteId = params.id as string

  const { data: site } = useSite(siteId)

  const { period, dateRange, periodReady, setPeriod, shiftPeriod, siteNow, pickerProps } = useUrlDateRange({
    pageKey: 'pages',
    timezone: site?.timezone,
  })

  // 🔴 Never fetch on a period the user did not choose. Before the range-memory
  // read lands, `period` is a PLACEHOLDER — fetching with it is what once showed
  // a customer 30 days of data under a "Today" label (useUrlDateRange:194).
  const range = fetchableRange(periodReady, dateRange)

  const { data, error, isLoading } = usePagesTable(
    siteId, range.start, range.end, 500, undefined, undefined
  )

  const rows = data?.pages ?? []

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 pt-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-white">Pages</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Every page on this site, with how long people stayed on it.
            {site?.timezone ? ` ${siteDaysCaption(site.timezone)}` : ''}
          </p>
        </div>
        <DateRangePicker
          period={period}
          dateRange={dateRange}
          onPeriodChange={(p) => setPeriod(p as Period)}
          onDateRangeChange={(r) => setPeriod('custom', r)}
          onShift={shiftPeriod}
          now={siteNow}
          align="right"
          {...pickerProps}
        />
      </div>

      {error ? (
        <ErrorCard
          title="Could not load pages"
          description="The request failed. This is usually temporary."
        />
      ) : isLoading && rows.length === 0 ? (
        <div className="rounded-none border border-border bg-card h-96 animate-pulse" aria-hidden="true" />
      ) : (
        <PagesTable rows={rows} total={rows.length} showTitle={false} />
      )}
    </div>
  )
}
