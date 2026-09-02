'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getPublicDashboard, getPublicRealtime, authenticatePublicDashboard, type DashboardData, type Stats } from '@/lib/api/stats'
import { toast } from '@ciphera-net/facet'
import { getAuthErrorMessage } from '@ciphera-net/facet'
import { ApiError } from '@/lib/api/client'
import { env } from '@/lib/env'
import { LoadingOverlay, Button } from '@ciphera-net/facet'
import TopPages from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import Campaigns from '@/components/dashboard/Campaigns'
import ContentSignals from '@/components/dashboard/ContentSignals'
import SectionHeader from '@/components/dashboard/SectionHeader'
import { type MetricType } from '@/lib/dashboard/metrics'
import { Captcha, DownloadIcon, ZapIcon } from '@ciphera-net/facet'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { PERIOD_TO_API } from '@/lib/constants/periods'
import { DashboardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import ExportModal from '@/components/dashboard/ExportModal'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
// Static, unlike the authed page's dynamic() mount: there the deck defers
// behind an app shell that renders regardless; here the deck IS the page's
// content and renders only after data arrives anyway — a deferred chunk
// would just add a loading pop to the page's one artifact.
import CommandDeck from '@/components/dashboard/CommandDeck'

// * The shared (public) dashboard is a public-scoped read. The backend serves only
// * these fixed, day-granular windows there (see resolvePublicScopedRange); anything
// * else — 1h/24h, custom ranges, sub-day intervals — is refused, because on a public
// * link they can reconstruct an individual visitor. The picker offers only these, and
// * loadDashboard coerces anything stale to 30 days.
const SHARE_ALLOWED_PERIODS = ['today', 'yesterday', '7', '30']
// The to-date keys are the URL grammar's week/month/qtd/year since the Phase 2
// vocabulary unification — excluded by their CURRENT keys, or they reappear in
// the picker and 400 against the server's fixed-period allowlist.
const SHARE_EXCLUDED_PRESETS = [
  '1h', '24h',
  'last-week', 'last-month', 'last-quarter', 'last-year',
  'week', 'month', 'qtd', 'year',
]

// Helper to get date ranges
const getDateRange = (days: number) => {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (days - 1)) // -1 because today counts as 1 day
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  }
}

// The whole public dashboard view, extracted from app/share/[id]/page.tsx
// (02-09-2026) so /demo can mount the SAME surface pinned to ciphera.net —
// the owner's ruling that the demo IS the real dashboard, not a copy of it.
// contextLine is the header's muted first line: "Public dashboard" on a
// share link, the live-demo sentence on /demo.
interface PublicDashboardProps {
  siteId: string
  contextLine?: string
}

export default function PublicDashboard({ siteId, contextLine = 'Public dashboard' }: PublicDashboardProps) {

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [password, setPassword] = useState('')
  const [isPasswordProtected, setIsPasswordProtected] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)

  // Captcha State
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSolution, setCaptchaSolution] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  
  const [period, setPeriod] = useState('30')
  const [dateRange, setDateRange] = useState(getDateRange(30))
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [todayInterval, setTodayInterval] = useState<'minute' | 'hour'>('hour')
  const [multiDayInterval, setMultiDayInterval] = useState<'hour' | 'day'>('day')
  // The deck's active rail metric. Local, not URL-persisted like the authed
  // page's — a share link should always open on visitors.
  const [metric, setMetric] = useState<MetricType>('visitors')

  // Previous period comparison is not available on the public share surface — it
  // required arbitrary-date fetches, which are the range-differencing primitive the
  // surface now refuses. prevStats stays undefined; the chart renders without deltas.
  const [prevStats] = useState<Stats | undefined>(undefined)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)

  // * Tick every 1s so "Live · Xs ago" counts in real time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const loadRealtime = useCallback(async () => {
    try {
      const realtimeData = await getPublicRealtime(siteId)
      // Functional update, and only onto a payload that still exists: the
      // 30s tick runs this NEXT TO loadDashboard, and when the dashboard
      // load 401s (expired share cookie) it clears the payload — a stale
      // closure here would resurrect the cleared data and paint the old
      // dashboard behind the password prompt.
      setData((prev) => (prev ? { ...prev, realtime_visitors: realtimeData.visitors } : prev))
    } catch {
      // Silently fail for realtime updates
    }
  }, [siteId])

  const loadDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)

      // * A shared dashboard is a public-scoped read: the backend serves only fixed,
      // * allowlisted windows at day granularity (privacy — arbitrary ranges and
      // * sub-day buckets on a public link can reconstruct one visitor's session).
      // * We therefore always send an allowlisted period, never start/end, and never
      // * a previous-period comparison (which required arbitrary-date fetches — the
      // * exact range-differencing primitive the surface now refuses).
      const sharePeriod = SHARE_ALLOWED_PERIODS.includes(period) ? period : '30'
      const sharePeriodApi = PERIOD_TO_API[sharePeriod]

      const dashboardData = await getPublicDashboard(
        siteId, undefined, undefined, 10, 'day', sharePeriodApi,
      )

      setData(dashboardData)
      setLastUpdatedAt(Date.now())
      setIsPasswordProtected(false)
    } catch (error: unknown) {
      const apiErr = error instanceof ApiError ? error : null
      if (apiErr?.status === 401 && (apiErr.data as Record<string, unknown>)?.is_protected) {
        // The share cookie is the ONLY grant now, so its expiry is the normal
        // failure mode of a protected share. Clear the payload with the flag:
        // the password gate renders on `isPasswordProtected && !data`, and
        // keeping stale numbers behind a live-looking indicator is the lie
        // this page exists not to tell.
        setIsPasswordProtected(true)
        setData(null)
        setLastUpdatedAt(null)
      } else if (apiErr?.status === 404) {
        toast.error('Site not found')
      } else if (!silent) {
        toast.error(getAuthErrorMessage(error) || 'Failed to load public dashboard')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [siteId, period])

  // * Auto-refresh interval: chart, KPIs, and realtime count update every 30 seconds
  useEffect(() => {
    if (data && !isPasswordProtected) {
      const interval = setInterval(() => {
        loadDashboard(true)
        loadRealtime()
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [data, isPasswordProtected, loadDashboard, loadRealtime])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    try {
      await authenticatePublicDashboard(siteId, password, captchaToken, captchaId, captchaSolution)
      // Cookie is now set — load dashboard (cookie sent automatically)
      setIsAuthenticated(true)
      await loadDashboard()
    } catch (error: unknown) {
      const apiErr = error instanceof ApiError ? error : null
      if (apiErr?.status === 401) {
        const errData = apiErr.data as Record<string, unknown> | undefined
        const errMsg = errData?.error as string | undefined
        toast.error(errMsg || 'Invalid password or captcha')
      } else {
        toast.error('Authentication failed')
      }
      // Reset captcha on failure
      setCaptchaId('')
      setCaptchaSolution('')
      setCaptchaToken('')
    } finally {
      setAuthLoading(false)
    }
  }

  const showSkeleton = useMinimumLoading(loading && !data && !isPasswordProtected)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) {
    return <DashboardSkeleton />
  }

  if (isPasswordProtected && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-card border border-border max-w-md w-full rounded-none p-6 transition-shadow duration-slow ease-apple">
          <div className="text-center mb-6">
             <div className="w-12 h-12 bg-brand-orange/10 rounded-none flex items-center justify-center mx-auto mb-4 text-brand-orange">
              <ZapIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Protected Dashboard
            </h1>
            <p className="text-neutral-400">
              This dashboard is password protected. Please enter the password to view stats.
            </p>
          </div>
          
          <form onSubmit={handlePasswordSubmit}>
            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-2 border border-neutral-700 rounded-none bg-neutral-800 text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                autoFocus
              />
            </div>
            <div className="mb-4">
                <Captcha
                    onVerify={(id, solution, token) => {
                        setCaptchaId(id)
                        setCaptchaSolution(solution)
                        setCaptchaToken(token || '')
                    }}
                    apiUrl={env.NEXT_PUBLIC_CAPTCHA_API_URL}
                    action="share-access"
                />
            </div>
            <Button
              type="submit"
              variant="default"
              className="w-full"
            >
              Access Dashboard
            </Button>
          </form>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { site, stats, daily_stats, top_pages, entry_pages, exit_pages, top_referrers, countries, cities, regions, languages, timezones, browsers, os, devices, screen_resolutions, realtime_visitors } = data

  // Provide defaults for potentially undefined data
  const safeDailyStats = daily_stats || []
  const safeStats = stats || { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null }
  const safeTopPages = top_pages || []
  const safeEntryPages = entry_pages || []
  const safeExitPages = exit_pages || []
  const safeTopReferrers = top_referrers || []
  const safeCountries = countries || []
  const safeCities = cities || []
  const safeRegions = regions || []
  const safeLanguages = languages || []
  const safeTimezones = timezones || []
  const safeBrowsers = browsers || []
  const safeOS = os || []
  const safeDevices = devices || []
  const safeScreenResolutions = screen_resolutions || []
  // The F9 denominator, once — every card divides by the same totals.
  const totals = { pageviews: safeStats.pageviews, visitors: safeStats.visitors }

  return (
    <div className={`min-h-screen ${fadeClass}`}>
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header — the authed dashboard's grammar (owner pick 02-09, round-2
            variant 2; mocks in docs/data/02-09-2026-demo-strip-mocks). The
            muted context line replaces the orange eyebrow, colour lives in
            the chip's DOT and never a tinted panel (the estate's dot-and-word
            device), and the title sits at the app's scale, not a hero's. One
            chip for every breakpoint — the old desktop/mobile twins are gone. */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{contextLine}</p>
              <div className="mt-2 flex items-center gap-3">
                <SiteFavicon
                  domain={site.domain}
                  name={site.name}
                  size={24}
                  className="w-6 h-6 rounded-none"
                />
                <h1 className="text-xl font-semibold text-foreground">{site.domain}</h1>
              </div>
              <div className="mt-3 flex w-fit items-center gap-2 rounded-none border border-border bg-card px-3 py-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {realtime_visitors} current visitors
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="hidden md:flex items-center gap-2 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-none text-sm text-neutral-400 hover:text-brand-orange transition-colors ease-apple"
              >
                <DownloadIcon className="w-4 h-4" />
                <span>Export</span>
              </button>

              <DateRangePicker
                period={period}
                dateRange={dateRange}
                onPeriodChange={(p) => setPeriod(SHARE_ALLOWED_PERIODS.includes(p) ? p : '30')}
                onDateRangeChange={setDateRange}
                excludePresets={SHARE_EXCLUDED_PRESETS}
                presetsOnly
              />
              {/* Powered by Ciphera Badge */}
              <a 
                href="https://ciphera.net" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hidden md:flex items-center gap-2 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-none text-sm text-neutral-400 hover:text-brand-orange transition-colors ease-apple"
              >
                <ZapIcon className="w-4 h-4" />
                <span>Powered by Ciphera</span>
              </a>
            </div>
          </div>
        </div>

        {/* The deck — the same instrument as the authed dashboard (owner
            ruling 02-09-2026, docs/plans/02-09-2026-demo-rebuild-design.md:
            the share surface matches the authed anatomy). prevStats stays
            undefined by the surface's own rule — the rail renders without
            deltas — and the export button drives the share's existing modal. */}
        <div className="mb-8">
          <CommandDeck
            data={safeDailyStats}
            stats={safeStats}
            prevStats={prevStats}
            metric={metric}
            onMetricChange={setMetric}
            interval="day"
            dateRange={dateRange}
            period={period}
            todayInterval={todayInterval}
            setTodayInterval={setTodayInterval}
            multiDayInterval={multiDayInterval}
            setMultiDayInterval={setMultiDayInterval}
            onExport={() => setIsExportModalOpen(true)}
          />
        </div>

        {/* What the minimum-cell-size floor withheld.
            Stated rather than applied silently: a shared dashboard drops every
            dimension row describing fewer than min_cell_size people, so the rows
            below deliberately do not sum to the totals above. Without this line the
            gap reads as a bug in the numbers — and the first person to notice would
            be right to report it. The block is absent entirely when nothing was
            withheld, so it never appears as a reassuring zero. */}
        {data.suppression && data.suppression.rows_withheld > 0 && (
          <p className="mb-6 text-xs text-neutral-500">
            {data.suppression.rows_withheld.toLocaleString()}{' '}
            {data.suppression.rows_withheld === 1 ? 'row is' : 'rows are'} hidden below,
            covering {data.suppression.pageviews_withheld.toLocaleString()} pageviews. A shared
            dashboard only shows breakdown rows with at least {data.suppression.min_cell_size}{' '}
            visitors, so no row can describe one person. Site totals are unaffected.
          </p>
        )}

        {/* The authed dashboard's section anatomy (same order, same grid
            classes — the authed page is the spec). totals: the same F9
            denominator as the owner's dashboard — the floor hides
            sub-5-visitor rows but never changes site totals, so each visible
            row's % is its true share. memberFeatures off everywhere: the
            full-list endpoints are member-only, so the affordance would only
            ever error here. No Behaviour section: hour-of-day buckets are
            refused on the public surface by design (F2 — an hourly bucket
            with one visitor is that person's arrival time). */}
        <SectionHeader title="Acquisition" note="whole site" />
        <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
          <TopReferrers
            referrers={safeTopReferrers}
            channels={data?.channels ?? []}
            collectReferrers={site.collect_referrers ?? true}
            siteId={siteId}
            dateRange={dateRange}
            totals={totals}
            memberFeatures={false}
          />
          {/* Campaign rows arrive ON the payload (floored, capped) — the
              campaigns prop is what keeps the member-only endpoint unarmed. */}
          <Campaigns
            siteId={siteId}
            dateRange={dateRange}
            totals={totals}
            campaigns={data?.campaigns ?? []}
          />
        </div>

        <SectionHeader title="Audience" note="whole site" />
        <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
          <Audience
            countries={safeCountries}
            cities={safeCities}
            regions={safeRegions}
            languages={safeLanguages}
            timezones={safeTimezones}
            geoDataLevel={site.collect_geo_data || 'full'}
            collectAudienceData={site.collect_audience_data ?? true}
            siteId={siteId}
            dateRange={dateRange}
            totals={totals}
            memberFeatures={false}
          />
          <TechSpecs
            browsers={safeBrowsers}
            os={safeOS}
            devices={safeDevices}
            screenResolutions={safeScreenResolutions}
            collectDeviceInfo={site.collect_device_info ?? true}
            collectScreenResolution={site.collect_screen_resolution ?? true}
            siteId={siteId}
            dateRange={dateRange}
            totals={totals}
            memberFeatures={false}
          />
        </div>

        <SectionHeader title="Content" note="whole site" />
        <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
          <TopPages
            topPages={safeTopPages}
            entryPages={safeEntryPages}
            exitPages={safeExitPages}
            domain={site.domain}
            collectPagePaths={site.collect_page_paths ?? true}
            siteId={siteId}
            dateRange={dateRange}
            totals={totals}
            memberFeatures={false}
          />
          <ContentSignals
            scrollDepth={data?.scroll_depth}
            goalCounts={data?.goal_counts ?? []}
            siteId={siteId}
            dateRange={dateRange}
            memberFeatures={false}
          />
        </div>

      </div>

      {data && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          data={data.daily_stats || []}
          stats={data.stats}
          topPages={data.top_pages}
          topReferrers={data.top_referrers}
        />
      )}
    </div>
  )
}
