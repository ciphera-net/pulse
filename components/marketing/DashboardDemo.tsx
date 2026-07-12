'use client'

import Chart from '@/components/dashboard/Chart'
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import { useState } from 'react'
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon } from '@ciphera-net/facet'
import type { EngagementPercentilesData } from '@/lib/api/stats'

// ─── Fixture data ────────────────────────────────────────────────────
// The demo portrays the dashboard's REAL first-load view: last 30 days at
// daily resolution. Dates are computed at render time so the axis always
// reads current; the value pattern is fixed so the artifact stays
// deterministic. Weekly rhythm (weekend dips) + a gentle upward trend.

const DAY_VISITORS = [
  74, 81, 88, 92, 96, 71, 64, 83, 90, 97,
  103, 108, 79, 72, 95, 104, 112, 118, 121, 88,
  81, 109, 117, 126, 131, 138, 99, 91, 128, 141,
]

const FAKE_DAILY_STATS = DAY_VISITORS.map((visitors, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (DAY_VISITORS.length - 1 - i))
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`
  return {
    date,
    visitors,
    pageviews: Math.round(visitors * (2.7 + ((i * 7) % 5) * 0.1)),
    bounce_rate: 46 - Math.round(i / 4) + ((i * 3) % 4),
    avg_duration: 128 + i + ((i * 11) % 17),
    avg_scroll_depth: 56 + ((i * 5) % 13),
    avg_visible_duration: 84 + ((i * 9) % 21),
  }
})

const totals = FAKE_DAILY_STATS.reduce(
  (acc, d) => ({ pageviews: acc.pageviews + d.pageviews, visitors: acc.visitors + d.visitors }),
  { pageviews: 0, visitors: 0 },
)

const FAKE_STATS = { pageviews: totals.pageviews, visitors: totals.visitors, bounce_rate: 41, avg_duration: 154, avg_scroll_depth: 62, avg_visible_duration: 97 }
const FAKE_PREV_STATS = { pageviews: Math.round(totals.pageviews * 0.86), visitors: Math.round(totals.visitors * 0.88), bounce_rate: 44, avg_duration: 139, avg_scroll_depth: 57, avg_visible_duration: 88 }

// Unlocks the real engagement KPI (score + S/T/D/B percentiles) instead of
// the "Collecting data · needs 7 days" warm-up placeholder.
const FAKE_ENGAGEMENT: EngagementPercentilesData = {
  summary: { score: 74, scroll_pctl: 68, time_pctl: 77, depth_pctl: 79, bounce_pctl: 63 },
  daily: FAKE_DAILY_STATS.map((d, i) => ({ date: d.date.slice(0, 10), score: 58 + ((i * 7) % 23) })),
  data_days: 30,
}

const FAKE_TOP_PAGES = [
  { path: '/', pageviews: 2341, visits: 1892 },
  { path: '/products/pulse', pageviews: 1567, visits: 1234 },
  { path: '/products/drop', pageviews: 987, visits: 812 },
  { path: '/pricing', pageviews: 876, visits: 723 },
  { path: '/blog/privacy-first-analytics', pageviews: 654, visits: 543 },
  { path: '/about', pageviews: 432, visits: 367 },
  { path: '/docs/getting-started', pageviews: 389, visits: 312 },
  { path: '/blog/end-to-end-encryption', pageviews: 345, visits: 289 },
  { path: '/contact', pageviews: 287, visits: 234 },
  { path: '/careers', pageviews: 198, visits: 167 },
]

const FAKE_ENTRY_PAGES = [
  { path: '/', pageviews: 1987, visits: 1654 },
  { path: '/products/pulse', pageviews: 1123, visits: 987 },
  { path: '/blog/privacy-first-analytics', pageviews: 567, visits: 489 },
  { path: '/products/drop', pageviews: 534, visits: 456 },
  { path: '/pricing', pageviews: 423, visits: 378 },
  { path: '/docs/getting-started', pageviews: 312, visits: 267 },
  { path: '/about', pageviews: 234, visits: 198 },
  { path: '/blog/end-to-end-encryption', pageviews: 198, visits: 167 },
  { path: '/careers', pageviews: 145, visits: 123 },
  { path: '/contact', pageviews: 112, visits: 98 },
]

const FAKE_EXIT_PAGES = [
  { path: '/pricing', pageviews: 1456, visits: 1234 },
  { path: '/', pageviews: 1234, visits: 1087 },
  { path: '/contact', pageviews: 876, visits: 756 },
  { path: '/products/drop', pageviews: 654, visits: 543 },
  { path: '/products/pulse', pageviews: 567, visits: 478 },
  { path: '/docs/getting-started', pageviews: 432, visits: 367 },
  { path: '/about', pageviews: 345, visits: 289 },
  { path: '/blog/privacy-first-analytics', pageviews: 298, visits: 245 },
  { path: '/careers', pageviews: 234, visits: 198 },
  { path: '/blog/end-to-end-encryption', pageviews: 178, visits: 145 },
]

const FAKE_REFERRERS = [
  { referrer: 'google.com', pageviews: 3421 },
  { referrer: '(direct)', pageviews: 2100 },
  { referrer: 'twitter.com', pageviews: 876 },
  { referrer: 'github.com', pageviews: 654 },
  { referrer: 'reddit.com', pageviews: 432 },
  { referrer: 'producthunt.com', pageviews: 312 },
  { referrer: 'news.ycombinator.com', pageviews: 267 },
  { referrer: 'linkedin.com', pageviews: 198 },
  { referrer: 'duckduckgo.com', pageviews: 112 },
  { referrer: 'dev.to', pageviews: 78 },
]

const FAKE_COUNTRIES = [
  { country: 'CH', pageviews: 2534 },
  { country: 'DE', pageviews: 1856 },
  { country: 'US', pageviews: 1234 },
  { country: 'FR', pageviews: 876 },
  { country: 'GB', pageviews: 654 },
  { country: 'NL', pageviews: 432 },
  { country: 'AT', pageviews: 312 },
  { country: 'SE', pageviews: 198 },
  { country: 'JP', pageviews: 156 },
  { country: 'CA', pageviews: 134 },
]

const FAKE_CITIES = [
  { city: 'Zurich', country: 'CH', pageviews: 1234 },
  { city: 'Geneva', country: 'CH', pageviews: 678 },
  { city: 'Berlin', country: 'DE', pageviews: 567 },
  { city: 'Munich', country: 'DE', pageviews: 432 },
  { city: 'San Francisco', country: 'US', pageviews: 345 },
  { city: 'Paris', country: 'FR', pageviews: 312 },
  { city: 'London', country: 'GB', pageviews: 289 },
  { city: 'Amsterdam', country: 'NL', pageviews: 234 },
  { city: 'Vienna', country: 'AT', pageviews: 198 },
  { city: 'New York', country: 'US', pageviews: 178 },
]

const FAKE_REGIONS = [
  { region: 'Zurich', country: 'CH', pageviews: 1567 },
  { region: 'Geneva', country: 'CH', pageviews: 734 },
  { region: 'Bavaria', country: 'DE', pageviews: 523 },
  { region: 'Berlin', country: 'DE', pageviews: 489 },
  { region: 'California', country: 'US', pageviews: 456 },
  { region: 'Ile-de-France', country: 'FR', pageviews: 345 },
  { region: 'England', country: 'GB', pageviews: 312 },
  { region: 'North Holland', country: 'NL', pageviews: 267 },
  { region: 'Bern', country: 'CH', pageviews: 234 },
  { region: 'New York', country: 'US', pageviews: 198 },
]

const FAKE_BROWSERS = [
  { browser: 'Chrome', pageviews: 5234 },
  { browser: 'Firefox', pageviews: 1518 },
  { browser: 'Safari', pageviews: 987 },
  { browser: 'Edge', pageviews: 456 },
  { browser: 'Brave', pageviews: 178 },
  { browser: 'Arc', pageviews: 59 },
]

const FAKE_OS = [
  { os: 'macOS', pageviews: 3421 },
  { os: 'Windows', pageviews: 2567 },
  { os: 'Linux', pageviews: 1234 },
  { os: 'iOS', pageviews: 756 },
  { os: 'Android', pageviews: 454 },
]

const FAKE_DEVICES = [
  { device: 'Desktop', pageviews: 5876 },
  { device: 'Mobile', pageviews: 1987 },
  { device: 'Tablet', pageviews: 569 },
]

const FAKE_SCREEN_RESOLUTIONS = [
  { screen_resolution: '1920x1080', pageviews: 2345 },
  { screen_resolution: '1440x900', pageviews: 1567 },
  { screen_resolution: '2560x1440', pageviews: 1234 },
  { screen_resolution: '1366x768', pageviews: 876 },
  { screen_resolution: '3840x2160', pageviews: 654 },
  { screen_resolution: '1536x864', pageviews: 432 },
  { screen_resolution: '390x844', pageviews: 312 },
  { screen_resolution: '393x873', pageviews: 234 },
]

// ─── Component ───────────────────────────────────────────────────────

export default function DashboardDemo() {
  const [todayInterval, setTodayInterval] = useState<'minute' | 'hour'>('hour')
  const [multiDayInterval, setMultiDayInterval] = useState<'hour' | 'day'>('day')
  // 30-day range matching the fixture series (the dashboard's default view).
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (DAY_VISITORS.length - 1))
  const dateRange = { start: fmt(start), end: fmt(end) }

  const noop = () => {}

  return (
    <div className="overflow-hidden border border-border bg-card">
      {/* Dashboard surface — flat, bordered, no glow gimmick. overflow-hidden:
          the real dashboard widgets inside (Audience tab row) are wider than a
          390px viewport; this demo is a decorative artifact, so it clips at its
          frame instead of dragging the whole page sideways. */}
      <div className="p-4 sm:p-6">
        {/* Dashboard header — mirrors the real toolbar: live chip left,
            Filter + range stepper right (static chrome; the site identity
            block frames the artifact for marketing). */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-foreground">Ciphera</h2>
              <p className="text-sm text-muted-foreground">ciphera.net</p>
            </div>
            <div className="flex items-center gap-2 border border-border px-3 py-1">
              <span className="h-2 w-2 bg-green-500" />
              <span className="text-sm font-medium text-muted-foreground">12 current visitors</span>
            </div>
          </div>
          <div aria-hidden="true" className="hidden items-center gap-2 sm:flex">
            <span className="flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground">
              <SearchIcon className="h-3.5 w-3.5" />
              Filter
            </span>
            <span className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground">
              <ChevronLeftIcon className="h-4 w-4" />
            </span>
            <span className="flex h-9 items-center border border-border px-3 text-sm text-muted-foreground">
              Last 30 days
            </span>
            <span className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground">
              <ChevronRightIcon className="h-4 w-4" />
            </span>
          </div>
        </div>

        {/* Chart with stats — the real component in its real default state:
            30 days, daily interval, engagement percentiles live, export icon. */}
        <div className="mb-6">
            <Chart
              data={FAKE_DAILY_STATS}
              stats={FAKE_STATS}
              prevStats={FAKE_PREV_STATS}
              interval="day"
              dateRange={dateRange}
              period="30"
              todayInterval={todayInterval}
              setTodayInterval={setTodayInterval}
              multiDayInterval={multiDayInterval}
              setMultiDayInterval={setMultiDayInterval}
              engagementData={FAKE_ENGAGEMENT}
              onExport={noop}
            />
          </div>

          {/* 2-col grid: Pages + Referrers */}
          <div className="grid gap-6 lg:grid-cols-2 mb-6 [&>*]:min-w-0">
            <ContentStats
              topPages={FAKE_TOP_PAGES}
              entryPages={FAKE_ENTRY_PAGES}
              exitPages={FAKE_EXIT_PAGES}
              domain="ciphera.net"
              collectPagePaths={true}
              siteId="demo"
              dateRange={dateRange}
              onFilter={noop}
            />
            <TopReferrers
              referrers={FAKE_REFERRERS}
              collectReferrers={true}
              siteId="demo"
              dateRange={dateRange}
              onFilter={noop}
            />
          </div>

          {/* 2-col grid: Locations + Tech */}
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Audience
              countries={FAKE_COUNTRIES}
              cities={FAKE_CITIES}
              regions={FAKE_REGIONS}
              languages={[]}
              timezones={[]}
              geoDataLevel="full"
              siteId="demo"
              dateRange={dateRange}
              onFilter={noop}
            />
            <TechSpecs
              browsers={FAKE_BROWSERS}
              os={FAKE_OS}
              devices={FAKE_DEVICES}
              screenResolutions={FAKE_SCREEN_RESOLUTIONS}
              collectDeviceInfo={true}
              collectScreenResolution={true}
              siteId="demo"
              dateRange={dateRange}
              onFilter={noop}
            />
          </div>
      </div>
    </div>
  )
}
