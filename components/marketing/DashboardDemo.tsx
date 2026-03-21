'use client'

import Chart from '@/components/dashboard/Chart'
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import { useState } from 'react'

// ─── Fake Data ───────────────────────────────────────────────────────

const FAKE_STATS = { pageviews: 8432, visitors: 2847, bounce_rate: 42, avg_duration: 154 }
const FAKE_PREV_STATS = { pageviews: 7821, visitors: 2543, bounce_rate: 45, avg_duration: 134 }

const FAKE_DAILY_STATS = [
  { date: '2026-03-21 00:00:00', pageviews: 42, visitors: 26, bounce_rate: 46, avg_duration: 118 },
  { date: '2026-03-21 01:00:00', pageviews: 38, visitors: 24, bounce_rate: 47, avg_duration: 115 },
  { date: '2026-03-21 02:00:00', pageviews: 35, visitors: 22, bounce_rate: 47, avg_duration: 112 },
  { date: '2026-03-21 03:00:00', pageviews: 34, visitors: 21, bounce_rate: 48, avg_duration: 110 },
  { date: '2026-03-21 04:00:00', pageviews: 36, visitors: 23, bounce_rate: 47, avg_duration: 112 },
  { date: '2026-03-21 05:00:00', pageviews: 45, visitors: 29, bounce_rate: 46, avg_duration: 116 },
  { date: '2026-03-21 06:00:00', pageviews: 62, visitors: 40, bounce_rate: 45, avg_duration: 122 },
  { date: '2026-03-21 07:00:00', pageviews: 95, visitors: 62, bounce_rate: 43, avg_duration: 132 },
  { date: '2026-03-21 08:00:00', pageviews: 148, visitors: 98, bounce_rate: 41, avg_duration: 145 },
  { date: '2026-03-21 09:00:00', pageviews: 215, visitors: 145, bounce_rate: 39, avg_duration: 155 },
  { date: '2026-03-21 10:00:00', pageviews: 285, visitors: 192, bounce_rate: 38, avg_duration: 162 },
  { date: '2026-03-21 11:00:00', pageviews: 338, visitors: 228, bounce_rate: 37, avg_duration: 168 },
  { date: '2026-03-21 12:00:00', pageviews: 355, visitors: 240, bounce_rate: 38, avg_duration: 165 },
  { date: '2026-03-21 13:00:00', pageviews: 372, visitors: 252, bounce_rate: 37, avg_duration: 170 },
  { date: '2026-03-21 14:00:00', pageviews: 390, visitors: 265, bounce_rate: 36, avg_duration: 175 },
  { date: '2026-03-21 15:00:00', pageviews: 385, visitors: 260, bounce_rate: 36, avg_duration: 173 },
  { date: '2026-03-21 16:00:00', pageviews: 362, visitors: 245, bounce_rate: 37, avg_duration: 168 },
  { date: '2026-03-21 17:00:00', pageviews: 325, visitors: 218, bounce_rate: 38, avg_duration: 162 },
  { date: '2026-03-21 18:00:00', pageviews: 282, visitors: 190, bounce_rate: 40, avg_duration: 155 },
  { date: '2026-03-21 19:00:00', pageviews: 238, visitors: 160, bounce_rate: 41, avg_duration: 148 },
  { date: '2026-03-21 20:00:00', pageviews: 195, visitors: 132, bounce_rate: 42, avg_duration: 140 },
  { date: '2026-03-21 21:00:00', pageviews: 155, visitors: 105, bounce_rate: 43, avg_duration: 132 },
  { date: '2026-03-21 22:00:00', pageviews: 112, visitors: 75, bounce_rate: 44, avg_duration: 125 },
  { date: '2026-03-21 23:00:00', pageviews: 72, visitors: 46, bounce_rate: 45, avg_duration: 120 },
]

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
  const today = new Date().toISOString().split('T')[0]
  const dateRange = { start: today, end: today }

  const noop = () => {}

  return (
    <div className="relative">
      {/* Orange glow behind */}
      <div className="absolute -inset-8 bg-brand-orange/8 rounded-[2.5rem] blur-3xl" />

      {/* Outer frame with showcase bg */}
      <div className="relative rounded-3xl border border-white/[0.08] overflow-hidden p-4 sm:p-6 lg:p-8">
        <img src="/pulse-showcase-bg.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40" />

        {/* Inner dashboard — solid background */}
        <div className="relative rounded-2xl bg-neutral-950/80 backdrop-blur-sm p-4 sm:p-6">
          {/* Dashboard header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Ciphera</h2>
                <p className="text-sm text-neutral-400">ciphera.net</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-sm font-medium text-green-400">12 current visitors</span>
              </div>
            </div>
            <div className="px-4 py-2 rounded-lg bg-neutral-900/80 border border-white/[0.08] text-sm text-neutral-300">
              Today
            </div>
          </div>

          {/* Chart with stats */}
          <div className="mb-6">
            <Chart
              data={FAKE_DAILY_STATS}
              stats={FAKE_STATS}
              prevStats={FAKE_PREV_STATS}
              interval={todayInterval}
              dateRange={dateRange}
              period="today"
              todayInterval={todayInterval}
              setTodayInterval={setTodayInterval}
              multiDayInterval={multiDayInterval}
              setMultiDayInterval={setMultiDayInterval}
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
            <Locations
              countries={FAKE_COUNTRIES}
              cities={FAKE_CITIES}
              regions={FAKE_REGIONS}
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
    </div>
  )
}
