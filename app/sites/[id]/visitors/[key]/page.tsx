'use client'

import { siteDaysCaption } from '@/lib/utils/timezones'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CaretRight, CaretDown } from '@phosphor-icons/react'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Pagination } from '@/components/search/rowPrimitives'
import { JourneyStrand } from '@/components/visitors/JourneyStrand'
import { VisitTrail } from '@/components/visitors/VisitTrail'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { BrowserMark, OSMark, ReferrerMark, DeviceGlyph, referrerLabel } from '@/components/visitors/VisitorIcons'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useDataWindow, useSite, useVisitorProfile, useVisitorVisits } from '@/lib/swr/dashboard'
import { REALTIME_MODES, REALTIME_ROLLING_MINUTES } from '@/lib/dashboard/realtimeRange'
import { serverResolvedPeriod } from '@/lib/dashboard/resolveRange'
import { visitorPseudonym } from '@/lib/visitors/pseudonym'
import { Avatar, visitorAvatarSeed } from '@ciphera-net/facet-avatar'
import { CompactNumber } from '@/components/ui/compact-number'
import {
  EM_DASH,
  SITE_TIMEZONE_FALLBACK,
  countryName,
  formatDuration,
  formatShortDate,
  formatVisitStart,
  visitorLocalTime,
} from '@/lib/visitors/format'
import { IDENTITY_COPY } from '@/lib/visitors/identityWindow'
import { deviceLabel } from '@/components/visitors/VisitorMeta'
import type { VisitRow, VisitorRange } from '@/lib/api/visitors'

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
  // The one view (PULSE-20), answered against the SAME window as the roster: the list
  // and the detail are one instrument. The orb lives on the roster; a ?period=realtime
  // link here still opens the five-minute mode, and any row leaves it.
  const dataWindow = useDataWindow(siteId, 'visitors')
  const { dateRange, period, periodReady, rollingMinutes, picker } = useUrlDateRange({
    surface: 'visitors',
    window: dataWindow,
    timezone: site?.timezone,
    modes: REALTIME_MODES,
    rollingMinutes: REALTIME_ROLLING_MINUTES,
    retentionMonths: site?.data_retention_months,
    daysCaption: siteDaysCaption(site?.timezone),
  })

  const [page, setPage] = useState(1)
  const [openVisit, setOpenVisit] = useState<string | null>(null)

  const allToken = serverResolvedPeriod(periodReady, period)
  const range = useMemo(
    () =>
      rollingMinutes != null
        ? { minutes: rollingMinutes }
        : { startDate: dateRange.start, endDate: dateRange.end, period: allToken },
    [rollingMinutes, dateRange.start, dateRange.end, allToken],
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

  // 🔴 THE SITE'S ZONE — see the roster page's note. It arrives on the same payloads as
  // the instants it applies to, so a date can never be rendered against a calendar that
  // has not arrived yet. `useSite` is the fallback for a response cached before the
  // field shipped; UTC is the server's own default and is never the reader's zone.
  const siteTimezone =
    data?.site_timezone || visitsData?.site_timezone || site?.timezone || SITE_TIMEZONE_FALLBACK

  useEffect(() => {
    document.title = `${name} · Visitors | Pulse`
  }, [name])

  const visits = visitsData?.visits ?? []

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
                ? IDENTITY_COPY.notFoundHint
                : 'The visitor did not come back. Try again.'
            }
          />
        </div>
      </div>
    )
  }

  const localTime = visitorLocalTime(profile?.timezone)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pt-6">
        <div className="min-w-0">
          <BackLink siteId={siteId} />
          {/* text-lg/font-semibold, not text-2xl/font-medium — the size every
              other detail room in the product uses (funnels is the reference).
              Part of the owner's 10-09 note: "make it consistent like the other
              screens in pulse". */}
          <h1 className="mt-2 flex items-center gap-3 text-lg font-semibold text-white">
            <Avatar seed={visitorAvatarSeed(visitorKey)} size={44} />
            {name}
            {/* The hash is the TRUE key and is always shown here. Pseudonyms
                collide by design; this is what makes two "Quiet Readers"
                distinguishable, and it is the one place a mono font is right —
                it is machine data, not chrome. */}
            <span className="font-mono text-sm text-neutral-500">{visitorKey.slice(0, 8)}</span>
            {profile?.active_now && (
              <>
                {/* aria-label on a bare span is an aria-prohibited-attr violation —
                    see the roster row's note. The visually-hidden text is the house
                    device and cannot be dropped by assistive technology. */}
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-brand-orange"
                  style={{ boxShadow: '0 0 0 4px rgb(255 92 0 / 0.18)' }}
                />
                <span className="sr-only">on the site now</span>
              </>
            )}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
            {profile?.active_now && <span className="text-brand-ink">Active now</span>}
            {localTime && (
              <>
                {profile?.active_now && <span className="text-neutral-700">·</span>}
                <span>{localTime} where they are</span>
              </>
            )}
            {/*
              🔴 THE DIMENSION LINE IS GONE FROM THE HEADER (approved round 5b, §4 A).
              Owner, 10-09-2026: the screen "shows a lot of duplicate data".
              Measured: it repeated FIVE of the Profile card's eight cells —
              country, city, browser, OS, device and referrer — 200px above them,
              and "Channel" down there is derived from the referrer beside it.

              ⚠️ IT MOVED, IT WAS NOT DELETED. The Profile card below keeps every
              one of those values AND its icon kit — CountryFlag, BrowserMark,
              OSMark, DeviceGlyph, ReferrerMark — untouched. Owner: "don't remove
              all the logos/icons from the block below". The header keeps its
              STATUS clause ("Active now · 16:29 where they are"), which the card
              only half-repeats and which answers a question at a glance:
              is it reasonable that they are reading this right now?
            */}
          </div>

          {profile && (
            <p className="mt-1 text-xs text-neutral-600">
              First seen {formatShortDate(profile.first_seen, siteTimezone)}
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

        <DateRangePicker {...picker} />
      </div>

      {/* ─── Visits ─── */}
      <div className="mt-6 rounded-none border border-border bg-card">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-medium text-white">Visits</h2>
          {/* Round-6 decision B: the page still holds the newest visits, and reads
              forwards in time — the same direction as the trail inside. The caption has to say BOTH, or "oldest first" alone
              reads as "page 1 is the beginning of time", which it is not. */}
          <span className="text-xs text-neutral-500">oldest first &middot; newest {VISITS_PAGE_SIZE}</span>
        </div>

        {visitsLoading && visits.length === 0 ? (
          <div className="p-4" role="status">
            <span className="sr-only">Loading visits…</span>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} aria-hidden="true" className="mb-3 h-9 animate-pulse rounded-none bg-neutral-800/50" />
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
                siteTimezone={siteTimezone}
                range={range}
                open={openVisit === v.visit_key}
                onToggle={() => setOpenVisit((k) => (k === v.visit_key ? null : v.visit_key))}
              />
            ))}
            {/* Zero-indexed component, one-indexed API — see the roster page. */}
            <Pagination
              page={page - 1}
              pageSize={VISITS_PAGE_SIZE}
              total={visitsData?.total ?? 0}
              onPage={(zeroBased) => setPage(zeroBased + 1)}
            />
          </>
        )}
      </div>

      {/* ─── Profile ─── */}
      {profile && (
        <div className="mt-6 rounded-none border border-border bg-card">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <h2 className="text-sm font-medium text-white">Profile</h2>
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
                  // The cell is LABELLED "Device · Screen", so it owes two
                  // values. A glyph beside a resolution answers only half of it
                  // and leaves the reader to decode a picture for the other.
                  <span className="flex items-center gap-1.5">
                    <DeviceGlyph device={profile.device_type} />
                    {profile.device_type ? deviceLabel(profile.device_type) : EM_DASH} ·{' '}
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
      className="text-sm text-brand-ink transition-opacity duration-fast ease-apple hover:opacity-80"
    >
      ← Visitors
    </Link>
  )
}

function Stat({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <>
      <CompactNumber value={n} className="text-neutral-300" /> {n === 1 ? one : many}
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
  siteTimezone,
  open,
  onToggle,
}: {
  siteId: string
  visitorKey: string
  visit: VisitRow
  range: VisitorRange
  siteTimezone: string
  open: boolean
  onToggle: () => void
}) {
  // This stamp is an instant: it follows the person's display preference
  // (Account › Profile › Show times in). The day-shaped data around it keeps
  // siteTimezone.
  const displayZone = useDisplayZone(siteTimezone)
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
        {visit.events > 0 && <span className="sr-only">an event fired on this visit. </span>}
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">
          <span className="text-neutral-500">
            {formatVisitStart(visit.started_at, displayZone.zone)}
          </span>{' '}
          <span className="text-neutral-700">·</span> {visit.entry_path ?? EM_DASH}
          {visit.exit_path && visit.exit_path !== visit.entry_path && (
            <>
              {' '}
              <span className="text-neutral-600">→</span> {visit.exit_path}
            </>
          )}
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums text-neutral-500">
          <CompactNumber value={visit.pageviews} /> {visit.pageviews === 1 ? 'page' : 'pages'} ·{' '}
          {formatDuration(visit.duration_seconds)}
        </span>
      </button>

      {open && (
        <VisitTrail siteId={siteId} visitorKey={visitorKey} visitKey={visit.visit_key} range={range} />
      )}
    </div>
  )
}
