'use client'

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import { createMap } from 'svg-dotted-map'
import {
  Files,
  ArrowSquareOut,
  MapPin,
  Monitor,
  Clock,
  Globe,
  GoogleLogo,
  XLogo,
  GithubLogo,
  YoutubeLogo,
  RedditLogo,
  Link,
} from '@phosphor-icons/react'

// ─── Dotted Map Setup (module-level, computed once) ──────────────────────────

const MAP_WIDTH = 150
const MAP_HEIGHT = 68
const DOT_RADIUS = 0.25

const { points: MAP_POINTS, addMarkers } = createMap({
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  mapSamples: 8000,
})

const _stagger = (() => {
  const sorted = [...MAP_POINTS].sort((a, b) => a.y - b.y || a.x - b.x)
  const rowMap = new Map<number, number>()
  let step = 0
  let prevY = Number.NaN
  let prevXInRow = Number.NaN

  for (const p of sorted) {
    if (p.y !== prevY) {
      prevY = p.y
      prevXInRow = Number.NaN
      if (!rowMap.has(p.y)) rowMap.set(p.y, rowMap.size)
    }
    if (!Number.isNaN(prevXInRow)) {
      const delta = p.x - prevXInRow
      if (delta > 0) step = step === 0 ? delta : Math.min(step, delta)
    }
    prevXInRow = p.x
  }

  return { xStep: step || 1, yToRowIndex: rowMap }
})()

const BASE_DOTS_PATH = (() => {
  const r = DOT_RADIUS
  const d = r * 2
  const parts: string[] = []
  for (const point of MAP_POINTS) {
    const rowIndex = _stagger.yToRowIndex.get(point.y) ?? 0
    const offsetX = rowIndex % 2 === 1 ? _stagger.xStep / 2 : 0
    const cx = point.x + offsetX
    const cy = point.y
    parts.push(`M${cx - r},${cy}a${r},${r} 0 1,0 ${d},0a${r},${r} 0 1,0 ${-d},0`)
  }
  return parts.join('')
})()

// Country centroids for marker placement (subset)
const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  CH: { lat: 46.8, lng: 8.2 },
  DE: { lat: 51.2, lng: 10.4 },
  US: { lat: 37.1, lng: -95.7 },
  GB: { lat: 55.4, lng: -3.4 },
  FR: { lat: 46.2, lng: 2.2 },
  IN: { lat: 20.6, lng: 78.9 },
  JP: { lat: 36.2, lng: 138.3 },
  AU: { lat: -25.3, lng: 133.8 },
  BR: { lat: -14.2, lng: -51.9 },
  CA: { lat: 56.1, lng: -106.3 },
}

// ─── Bar Row (shared by Pages, Referrers, Technology) ────────────────────────

function BarRow({
  label,
  value,
  maxValue,
  icon,
}: {
  label: string
  value: number
  maxValue: number
  icon?: React.ReactNode
}) {
  const pct = (value / maxValue) * 100
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 h-[30px] flex items-center">
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-brand-orange/25"
          style={{ width: `${pct}%` }}
        />
        <div className="relative z-10 flex items-center gap-2 pl-2.5">
          {icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>}
          <span className="text-xs text-white font-medium truncate">{label}</span>
        </div>
      </div>
      <span className="text-xs text-neutral-400 tabular-nums w-8 text-right shrink-0">{value}</span>
    </div>
  )
}

// ─── Card 1: Pages ───────────────────────────────────────────────────────────

function PagesCard() {
  const data = [
    { label: '/', value: 142 },
    { label: '/products/drop', value: 68 },
    { label: '/pricing', value: 31 },
    { label: '/blog', value: 24 },
    { label: '/about', value: 12 },
    { label: '/products/pulse', value: 9 },
  ]
  const max = data[0].value

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Files className="w-4 h-4 text-neutral-400" weight="bold" />
          <h4 className="text-sm font-bold text-white">Pages</h4>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-white border-b border-brand-orange pb-0.5">Top Pages</span>
          <span className="text-neutral-500">Entry</span>
          <span className="text-neutral-500">Exit</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.map((d) => (
          <BarRow key={d.label} label={d.label} value={d.value} maxValue={max} />
        ))}
      </div>
    </div>
  )
}

// ─── Card 2: Referrers ───────────────────────────────────────────────────────

function getReferrerIcon(name: string, favicon?: string) {
  // Use Google Favicon API for sites with domains (like real Pulse)
  if (favicon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={favicon} alt="" width={16} height={16} className="w-4 h-4 rounded object-contain" />
    )
  }
  const lower = name.toLowerCase()
  if (lower === 'direct') return <Globe className="w-4 h-4 text-neutral-400" />
  if (lower.includes('google')) return <GoogleLogo className="w-4 h-4 text-blue-500" />
  if (lower.includes('twitter') || lower.includes('x')) return <XLogo className="w-4 h-4 text-neutral-200" />
  if (lower.includes('github')) return <GithubLogo className="w-4 h-4 text-neutral-200" />
  if (lower.includes('youtube')) return <YoutubeLogo className="w-4 h-4 text-red-500" />
  if (lower.includes('reddit')) return <RedditLogo className="w-4 h-4 text-orange-500" />
  if (lower.includes('hacker') || lower.includes('hn')) return <Link className="w-4 h-4 text-orange-400" />
  return <Globe className="w-4 h-4 text-neutral-400" />
}

const FAVICON_URL = 'https://www.google.com/s2/favicons'

function ReferrersCard() {
  const data = [
    { label: 'Direct', value: 186 },
    { label: 'Google', value: 94, domain: 'google.com' },
    { label: 'Twitter / X', value: 47 },
    { label: 'GitHub', value: 32, domain: 'github.com' },
    { label: 'Hacker News', value: 18, domain: 'news.ycombinator.com' },
    { label: 'Reddit', value: 11, domain: 'reddit.com' },
  ]
  const max = data[0].value

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowSquareOut className="w-4 h-4 text-neutral-400" weight="bold" />
        <h4 className="text-sm font-bold text-white">Referrers</h4>
      </div>
      <div className="space-y-1.5">
        {data.map((d) => (
          <BarRow
            key={d.label}
            label={d.label}
            value={d.value}
            maxValue={max}
            icon={getReferrerIcon(
              d.label,
              'domain' in d ? `${FAVICON_URL}?domain=${d.domain}&sz=32` : undefined
            )}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Card 3: Locations (Real Dotted Map) ─────────────────────────────────────

function LocationsCard() {
  const mockData = [
    { country: 'CH', pageviews: 320 },
    { country: 'US', pageviews: 186 },
    { country: 'DE', pageviews: 142 },
    { country: 'GB', pageviews: 78 },
    { country: 'FR', pageviews: 54 },
    { country: 'IN', pageviews: 38 },
    { country: 'JP', pageviews: 22 },
    { country: 'AU', pageviews: 16 },
    { country: 'BR', pageviews: 12 },
    { country: 'CA', pageviews: 28 },
  ]

  const markerData = useMemo(() => {
    const max = Math.max(...mockData.map((d) => d.pageviews))
    return mockData
      .filter((d) => COUNTRY_CENTROIDS[d.country])
      .map((d) => ({
        lat: COUNTRY_CENTROIDS[d.country].lat,
        lng: COUNTRY_CENTROIDS[d.country].lng,
        size: 0.4 + (d.pageviews / max) * 0.8,
      }))
  }, [])

  const processedMarkers = useMemo(() => addMarkers(markerData), [markerData])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-neutral-400" weight="bold" />
          <h4 className="text-sm font-bold text-white">Locations</h4>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-white border-b border-brand-orange pb-0.5">Map</span>
          <span className="text-neutral-500">Countries</span>
          <span className="text-neutral-500">Regions</span>
          <span className="text-neutral-500">Cities</span>
        </div>
      </div>
      <div className="relative w-full aspect-[2.2/1] flex items-center justify-center">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="text-neutral-500 w-full h-full"
        >
          <defs>
            <filter id="mockup-marker-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 0.4 0 0 0  0 0 0 0 0  0 0 0 0.6 0"
              />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d={BASE_DOTS_PATH} fill="currentColor" />
          {processedMarkers.map((marker, index) => {
            const rowIndex = _stagger.yToRowIndex.get(marker.y) ?? 0
            const offsetX = rowIndex % 2 === 1 ? _stagger.xStep / 2 : 0
            const cx = marker.x + offsetX
            const cy = marker.y
            return (
              <circle
                key={`marker-${index}`}
                cx={cx}
                cy={cy}
                r={marker.size ?? DOT_RADIUS}
                fill="#FD5E0F"
                filter="url(#mockup-marker-glow)"
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Card 4: Technology ──────────────────────────────────────────────────────

const BROWSER_ICONS: Record<string, string> = {
  Chrome: '/icons/browsers/chrome.svg',
  Safari: '/icons/browsers/safari.svg',
  Firefox: '/icons/browsers/firefox.svg',
  Edge: '/icons/browsers/edge.svg',
  Arc: '/icons/browsers/arc.png',
  Opera: '/icons/browsers/opera.svg',
}

function TechnologyCard() {
  const data = [
    { label: 'Chrome', value: 412 },
    { label: 'Safari', value: 189 },
    { label: 'Firefox', value: 76 },
    { label: 'Edge', value: 34 },
    { label: 'Arc', value: 18 },
    { label: 'Opera', value: 7 },
  ]
  const max = data[0].value

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-neutral-400" weight="bold" />
          <h4 className="text-sm font-bold text-white">Technology</h4>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-white border-b border-brand-orange pb-0.5">Browsers</span>
          <span className="text-neutral-500">OS</span>
          <span className="text-neutral-500">Devices</span>
          <span className="text-neutral-500">Screens</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.map((d) => (
          <BarRow
            key={d.label}
            label={d.label}
            value={d.value}
            maxValue={max}
            icon={
              BROWSER_ICONS[d.label] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={BROWSER_ICONS[d.label]} alt={d.label} width={16} height={16} className="w-4 h-4" />
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

// ─── Card 5: Peak Hours (Exact Pulse Heatmap) ────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BUCKETS = 12
const BUCKET_LABELS: Record<number, string> = { 0: '00:00', 3: '06:00', 6: '12:00', 9: '18:00' }

const HIGHLIGHT_COLORS = [
  'transparent',
  'rgba(253,94,15,0.15)',
  'rgba(253,94,15,0.35)',
  'rgba(253,94,15,0.60)',
  'rgba(253,94,15,0.82)',
  '#FD5E0F',
]

// Pre-computed mock heatmap grid[day][bucket] with raw values
const MOCK_GRID = [
  [0, 0, 12, 28, 32, 45, 52, 48, 35, 24, 8, 0],   // Mon
  [0, 0, 8, 22, 38, 50, 58, 46, 40, 28, 12, 4],    // Tue
  [0, 0, 6, 18, 26, 42, 48, 56, 38, 22, 10, 0],    // Wed
  [0, 4, 10, 24, 42, 62, 86, 68, 44, 26, 12, 6],   // Thu
  [0, 6, 16, 34, 44, 58, 64, 48, 42, 28, 14, 0],   // Fri
  [4, 6, 8, 18, 22, 24, 26, 22, 32, 36, 20, 8],    // Sat
  [6, 4, 6, 10, 16, 20, 22, 14, 18, 24, 16, 8],    // Sun
]

function getHighlightColor(value: number, max: number): string {
  if (value === 0) return HIGHLIGHT_COLORS[0]
  if (value === max) return HIGHLIGHT_COLORS[5]
  const ratio = value / max
  if (ratio <= 0.25) return HIGHLIGHT_COLORS[1]
  if (ratio <= 0.50) return HIGHLIGHT_COLORS[2]
  if (ratio <= 0.75) return HIGHLIGHT_COLORS[3]
  return HIGHLIGHT_COLORS[4]
}

function PeakHoursCard() {
  const max = Math.max(...MOCK_GRID.flat())

  // Find best time
  let bestDay = 0
  let bestBucket = 0
  let bestVal = 0
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < BUCKETS; b++) {
      if (MOCK_GRID[d][b] > bestVal) {
        bestVal = MOCK_GRID[d][b]
        bestDay = d
        bestBucket = b
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-neutral-400" weight="bold" />
          <h4 className="text-sm font-bold text-white">Peak Hours</h4>
        </div>
      </div>
      <p className="text-[10px] text-neutral-500 mb-2">When your visitors are most active</p>

      <div className="flex flex-col gap-[5px]">
        {MOCK_GRID.map((buckets, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1.5">
            <span className="text-[11px] text-neutral-500 w-7 shrink-0 text-right leading-none">
              {DAYS[dayIdx]}
            </span>
            <div
              className="flex-1"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${BUCKETS}, 1fr)`,
                gap: '5px',
              }}
            >
              {buckets.map((value, bucket) => {
                const isBestCell = bestDay === dayIdx && bestBucket === bucket
                return (
                  <div
                    key={bucket}
                    className={`aspect-square w-full rounded-[4px] border border-neutral-800 ${
                      isBestCell ? 'ring-1 ring-brand-orange/40' : ''
                    }`}
                    style={{
                      backgroundColor: getHighlightColor(value, max),
                    } as CSSProperties}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Hour axis labels */}
      <div className="flex items-center gap-1.5">
        <span className="w-7 shrink-0" />
        <div className="flex-1 relative h-3">
          {Object.entries(BUCKET_LABELS).map(([b, label]) => (
            <span
              key={b}
              className="absolute text-[10px] text-neutral-600 -translate-x-1/2"
              style={{ left: `${(Number(b) / BUCKETS) * 100}%` }}
            >
              {label}
            </span>
          ))}
          <span
            className="absolute text-[10px] text-neutral-600 -translate-x-full"
            style={{ left: '100%' }}
          >
            24:00
          </span>
        </div>
      </div>

      {/* Intensity legend */}
      <div className="flex items-center justify-end gap-1.5 mt-1">
        <span className="text-[10px] text-neutral-500">Less</span>
        {HIGHLIGHT_COLORS.map((color, i) => (
          <div
            key={i}
            className="w-[10px] h-[10px] rounded-[2px] border border-neutral-800"
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="text-[10px] text-neutral-500">More</span>
      </div>

      <p className="text-[10px] text-neutral-400 text-center mt-1">
        Your busiest time is{' '}
        <span className="text-brand-orange font-medium">
          {['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'][bestDay]} at {String(bestBucket * 2).padStart(2, '0')}:00
        </span>
      </p>
    </div>
  )
}

// ─── Carousel ────────────────────────────────────────────────────────────────

const cards = [
  { id: 'pages', Component: PagesCard, title: 'Top Pages' },
  { id: 'referrers', Component: ReferrersCard, title: 'Referrers' },
  { id: 'locations', Component: LocationsCard, title: 'Locations' },
  { id: 'technology', Component: TechnologyCard, title: 'Technology' },
  { id: 'peak-hours', Component: PeakHoursCard, title: 'Peak Hours' },
]

export function PulseFeaturesCarousel() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  const next = useCallback(() => {
    setActive((prev) => (prev + 1) % cards.length)
  }, [])

  useEffect(() => {
    if (paused) return
    const interval = setInterval(next, 4000)
    return () => clearInterval(interval)
  }, [paused, next])

  const ActiveComponent = cards[active].Component

  return (
    <div
      className="relative w-full max-w-[520px] mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-6 py-5 shadow-2xl">
        <div className="min-h-[280px]">
          <ActiveComponent />
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2.5 mt-4">
        {cards.map((card, i) => (
          <button
            key={card.id}
            onClick={() => setActive(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === active
                ? 'w-7 bg-brand-orange'
                : 'w-2 bg-neutral-600 hover:bg-neutral-500'
            }`}
            aria-label={`Show ${card.title}`}
          />
        ))}
      </div>
    </div>
  )
}
