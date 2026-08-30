'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CaretRight, CaretDown } from '@phosphor-icons/react'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Pagination } from '@/components/search/rowPrimitives'
import { JourneyStrand } from '@/components/visitors/JourneyStrand'
import { MonthRibbon } from '@/components/visitors/MonthRibbon'
import { VisitorMeta } from '@/components/visitors/VisitorMeta'
import { VisitTrail } from '@/components/visitors/VisitTrail'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { BrowserMark, OSMark, ReferrerMark, DeviceGlyph, referrerLabel } from '@/components/visitors/VisitorIcons'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useSite, useVisitorProfile, useVisitorVisits } from '@/lib/swr/dashboard'
import { visitorPseudonym } from '@/lib/visitors/pseudonym'
import {
  EM_DASH,
  countryName,
  daysUntilMonthReset,
  formatDuration,
  formatShortDate,
  formatVisitStart,
  monthResetDate,
  visitorLocalTime,
} from '@/lib/visitors/format'
import { VISITORS_MIN_DATE, VISITORS_ROLLING_MINUTES, VISITORS_PRESETS } from '@/lib/visitors/range'
import type { VisitRow } from '@/lib/api/visitors'

// ─── The visitor page (approved design §9a, "The visitor page") ─────
//
// Reference render:
// Pulse/docs/data/30-08-2026-visitors-mocks/round4-detail-v4-full.png

const VISITS_PAGE_SIZE = 20

export default function VisitorDetailPage() {
  const params = useParams()
  const siteId = params.id as string
  const visitorKey = params.key as string

  const { data: site } = useSite(siteId)
  const { dateRange, period, periodReady, rollingMinutes, setPeriod, shiftPeriod, pickerProps } =
    useUrlDateRange({
      // The SAME pageKey as the roster: the list and the detail are one
      // instrument, so a range picked on one carries to the other (the funnels
      // list/detail precedent). A separate key here would silently reset the
      // range every time somebody clicked into a visitor.
      pageKey: 'visitors',
      minDate: VISITORS_MIN_DATE,
      rollingMinutes: VISITORS_ROLLING_MINUTES,
      extraPresets: VISITORS_PRESETS,
    })

  const [page, setPage] = useState(1)
  const [openVisit, setOpenVisit] = useState<string | null>(null)

  const range = useMemo(
    () =>
      rollingMinutes != null
        ? { minutes: rollingMinutes }
        : { startDate: dateRange.start, endDate: dateRange.end },
    [rollingMinutes, dateRange.start, dateRange.end],
  )

  const { data, error, isLoading } = useVisitorProfile(siteId, periodReady ? visitorKey : '', range)
  const { data: visitsData, isLoading: visitsLoading } = useVisitorVisits(
    siteId,
    periodReady ? visitorKey : '',
    range,
    page,
    VISITS_PAGE_SIZE,
  )

  const profile = data?.visitor
  const name = visitorPseudonym(visitorKey)

  useEffect(() => {
    document.title = `${name} · Visitors | Pulse`
  }, [name])

  // Memoised because it is a useMemo DEPENDENCY below: `?? []` mints a new
  // array every render, which would recompute the ribbon on every render.
  const visits = useMemo(() => visitsData?.visits ?? [], [visitsData])

  // The ribbon's day buckets come from the VISITS the page already has, not
  // from a second request. It is therefore honest about its own scope: it
  // shows the visits in this range, and the caption says which month.
  const visitsByDay = useMemo(() => {
    const acc: Record<number, number> = {}
    for (const v of visits) {
      const d = new Date(v.started_at)
      if (Number.isFinite(d.getTime())) acc[d.getDate()] = (acc[d.getDate()] ?? 0) + 1
    }
    return acc
  }, [visits])

  if (error) {
    const status = (error as { status?: number }).status
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
        <BackLink siteId={siteId} />
        <div className="mt-6">
          <ErrorCard
            title={status === 404 ? 'No such visitor in this range' : "Couldn't load this visitor"}
            description={
              status === 404
                ? 'This identity has no visible activity in the selected range. It may belong to a different month — identities reset monthly.'
                : 'The visitor did not come back. Try again.'
            }
          />
        </div>
      </div>
    )
  }

  const resetsIn = profile ? daysUntilMonthReset(profile.month) : null
  const localTime = visitorLocalTime(profile?.timezone)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pt-6">
        <div className="min-w-0">
          <BackLink siteId={siteId} />
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-medium text-white">
            {name}
            {/* The hash is the TRUE key and is always shown here. Pseudonyms
                collide by design; this is what makes two "Quiet Readers"
                distinguishable, and it is the one place a mono font is right —
                it is machine data, not chrome. */}
            <span className="font-mono text-sm text-neutral-500">{visitorKey.slice(0, 8)}</span>
            {profile?.active_now && (
              <span
                className="size-2 rounded-full bg-brand-orange"
                style={{ boxShadow: '0 0 0 4px rgb(255 92 0 / 0.18)' }}
                aria-label="on the site now"
              />
            )}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
            {profile?.active_now && <span className="text-brand-orange">Active now</span>}
            {localTime && (
              <>
                {profile?.active_now && <span className="text-neutral-700">·</span>}
                <span>{localTime} where they are</span>
              </>
            )}
            {profile && (
              <>
                {(profile.active_now || localTime) && <span className="text-neutral-700">·</span>}
                <VisitorMeta
                  className="text-sm"
                  country={profile.country}
                  city={profile.city}
                  browser={profile.browser}
                  os={profile.os}
                  deviceType={profile.device_type}
                  referrer={profile.referrer}
                  collectsReferrers={site?.collect_referrers ?? false}
                />
              </>
            )}
          </div>

          {profile && (
            <p className="mt-1 text-xs text-neutral-600">
              First seen {formatShortDate(profile.first_seen)} · this identity resets{' '}
              {monthResetDate(profile.month)} — a returning reader becomes a new visitor
            </p>
          )}

          {profile && (
            <p className="mt-3 text-sm text-neutral-400">
              <Stat n={profile.visits} one="visit" many="visits" /> ·{' '}
              <Stat n={profile.pageviews} one="page" many="pages" /> ·{' '}
              <Stat n={profile.events} one="event" many="events" /> ·{' '}
              <span className="tabular-nums text-neutral-300">
                {formatDuration(profile.avg_visit_seconds)}
              </span>{' '}
              avg visit
            </p>
          )}
        </div>

        <DateRangePicker
          period={period}
          dateRange={dateRange}
          onPeriodChange={(p) => setPeriod(p as never)}
          onDateRangeChange={(r) => setPeriod('custom', r)}
          onShift={shiftPeriod}
          align="right"
          {...pickerProps}
        />
      </div>

      {profile && (
        <div className="mt-6">
          <MonthRibbon
            month={profile.month}
            visitsByDay={visitsByDay}
            today={todayInMonth(profile.month)}
            resetsInDays={resetsIn}
          />
        </div>
      )}

      {/* ─── Visits ─── */}
      <div className="mt-6 rounded-none border border-border bg-card">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-medium text-white">Visits</span>
          <span className="text-xs text-neutral-500">newest first</span>
        </div>

        {visitsLoading && visits.length === 0 ? (
          <div className="p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="mb-3 h-9 animate-pulse rounded-none bg-neutral-800/50" />
            ))}
          </div>
        ) : visits.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-neutral-500">
            {isLoading ? 'Loading…' : 'No visits in this range.'}
          </p>
        ) : (
          <>
            {visits.map((v) => (
              <VisitRowItem
                key={v.visit_key}
                siteId={siteId}
                visitorKey={visitorKey}
                visit={v}
                range={range}
                open={openVisit === v.visit_key}
                onToggle={() => setOpenVisit((k) => (k === v.visit_key ? null : v.visit_key))}
              />
            ))}
            <Pagination
              page={page}
              pageSize={VISITS_PAGE_SIZE}
              total={visitsData?.total ?? 0}
              onPage={setPage}
            />
          </>
        )}
      </div>

      {/* ─── Profile ─── */}
      {profile && (
        <div className="mt-6 rounded-none border border-border bg-card">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <span className="text-sm font-medium text-white">Profile</span>
            <span className="text-xs text-neutral-500">first touch · latest observed</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-b border-border/60 md:border-r">
              <ProfileCell label="Referrer">
                <span className="flex items-center gap-1.5">
                  <ReferrerMark referrer={profile.referrer} />
                  {profile.referrer === null ? EM_DASH : referrerLabel(profile.referrer)}
                </span>
              </ProfileCell>
              <ProfileCell label="Entry page">{profile.entry_path ?? EM_DASH}</ProfileCell>
              <ProfileCell label="Channel">
                {profile.referrer === null ? EM_DASH : profile.referrer ? 'Referral' : 'Direct'}
              </ProfileCell>
              <ProfileCell label="Language" last>
                {profile.language ?? EM_DASH}
              </ProfileCell>
            </div>
            <div>
              <ProfileCell label="Country · City">
                {profile.country ? (
                  <span className="flex items-center gap-1.5">
                    <CountryFlag code={profile.country} className="h-3 w-[18px] rounded-none" />
                    {countryName(profile.country)} · {profile.city ?? EM_DASH}
                  </span>
                ) : (
                  EM_DASH
                )}
              </ProfileCell>
              <ProfileCell label="Browser · OS">
                {profile.browser || profile.os ? (
                  <span className="flex items-center gap-1.5">
                    <BrowserMark browser={profile.browser} />
                    {profile.browser ?? EM_DASH} ·<OSMark os={profile.os} />
                    {profile.os ?? EM_DASH}
                  </span>
                ) : (
                  EM_DASH
                )}
              </ProfileCell>
              <ProfileCell label="Device · Screen">
                {profile.device_type || profile.screen_resolution ? (
                  <span className="flex items-center gap-1.5">
                    <DeviceGlyph device={profile.device_type} />
                    {profile.screen_resolution ?? EM_DASH}
                  </span>
                ) : (
                  EM_DASH
                )}
              </ProfileCell>
              <ProfileCell label="Local time" last>
                {localTime ? `${localTime} · ${profile.timezone}` : EM_DASH}
              </ProfileCell>
            </div>
          </div>
        </div>
      )}

      {site && (
        <p className="mt-4 text-xs text-neutral-600">
          Blank cells are data {site.domain} does not collect — not data we are hiding.
        </p>
      )}
    </div>
  )
}

function BackLink({ siteId }: { siteId: string }) {
  return (
    <Link
      href={`/sites/${siteId}/visitors`}
      className="text-sm text-brand-orange transition-opacity duration-fast ease-apple hover:opacity-80"
    >
      ← Visitors
    </Link>
  )
}

function Stat({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <>
      <span className="tabular-nums text-neutral-300">{n}</span> {n === 1 ? one : many}
    </>
  )
}

function ProfileCell({
  label,
  children,
  last,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={
        'flex items-center justify-between gap-3 px-4 py-3 text-sm ' +
        (last ? '' : 'border-b border-border/60')
      }
    >
      <span className="text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right text-neutral-300">{children}</span>
    </div>
  )
}

function VisitRowItem({
  siteId,
  visitorKey,
  visit,
  range,
  open,
  onToggle,
}: {
  siteId: string
  visitorKey: string
  visit: VisitRow
  range: { startDate?: string; endDate?: string; minutes?: number | null }
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ease-apple hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
      >
        {open ? (
          <CaretDown className="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        ) : (
          <CaretRight className="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        )}
        <JourneyStrand
          pages={visit.pageviews}
          eventAt={visit.events > 0 ? [Math.min(2, Math.max(0, visit.pageviews - 1))] : []}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">
          <span className="text-neutral-500">{formatVisitStart(visit.started_at)}</span>{' '}
          <span className="text-neutral-700">·</span> {visit.entry_path ?? EM_DASH}
          {visit.exit_path && visit.exit_path !== visit.entry_path && (
            <>
              {' '}
              <span className="text-neutral-600">→</span> {visit.exit_path}
            </>
          )}
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums text-neutral-500">
          {visit.pageviews} {visit.pageviews === 1 ? 'page' : 'pages'} ·{' '}
          {formatDuration(visit.duration_seconds)}
        </span>
      </button>

      {open && (
        <VisitTrail siteId={siteId} visitorKey={visitorKey} visitKey={visit.visit_key} range={range} />
      )}
    </div>
  )
}

/** Today's day-of-month, but only when today falls inside the identity's month. */
function todayInMonth(month: string): number | null {
  const now = new Date()
  const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return label === month ? now.getDate() : null
}
