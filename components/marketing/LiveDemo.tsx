'use client'

import { useState, useEffect, useRef } from 'react'

// ── Helpers ──────────────────────────────────────────────────

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

// Generate realistic hourly visitor counts (low at night, peak afternoon)
function generateHourlyPattern(): { hour: string; visitors: number; pageviews: number }[] {
  const base = [
    12, 8, 5, 4, 3, 4, 8, 18, 35, 52, 64, 72,
    78, 85, 88, 82, 74, 60, 48, 38, 30, 25, 20, 16,
  ]
  return base.map((v, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    visitors: v + rand(-4, 4),
    pageviews: Math.round(v * 2.8) + rand(-6, 6),
  }))
}

// ── Static panel data ────────────────────────────────────────

const topPages = [
  { label: '/blog/privacy', pct: 85 },
  { label: '/pricing', pct: 65 },
  { label: '/docs', pct: 45 },
  { label: '/about', pct: 30 },
  { label: '/integrations', pct: 20 },
]

const topReferrers = [
  { label: 'Google', pct: 40 },
  { label: 'Direct', pct: 25 },
  { label: 'Twitter', pct: 15 },
  { label: 'GitHub', pct: 12 },
  { label: 'Reddit', pct: 8 },
]

const locations = [
  { flag: '\u{1F1E8}\u{1F1ED}', name: 'Switzerland', pct: 30 },
  { flag: '\u{1F1E9}\u{1F1EA}', name: 'Germany', pct: 22 },
  { flag: '\u{1F1FA}\u{1F1F8}', name: 'USA', pct: 18 },
  { flag: '\u{1F1EB}\u{1F1F7}', name: 'France', pct: 15 },
  { flag: '\u{1F1EC}\u{1F1E7}', name: 'UK', pct: 15 },
]

const technology = [
  { label: 'Chrome', pct: 62 },
  { label: 'Firefox', pct: 18 },
  { label: 'Safari', pct: 15 },
  { label: 'Edge', pct: 5 },
]

const campaigns = [
  { label: 'newsletter', pct: 45 },
  { label: 'twitter', pct: 30 },
  { label: 'producthunt', pct: 25 },
]

// Generate heatmap data: 7 rows (Mon-Sun) x 24 cols (hours)
function generateHeatmap(): number[][] {
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const isWeekend = day >= 5
      const isNight = hour >= 1 && hour <= 5
      const isPeak = hour >= 9 && hour <= 17
      const isMorning = hour >= 7 && hour <= 9
      const isEvening = hour >= 17 && hour <= 21

      if (isNight) return rand(0, 1)
      if (isWeekend) {
        if (isPeak) return rand(2, 4)
        return rand(1, 3)
      }
      if (isPeak) return rand(5, 8)
      if (isMorning || isEvening) return rand(3, 5)
      return rand(1, 3)
    })
  )
}

function heatmapOpacity(value: number): string {
  if (value <= 1) return 'bg-brand-orange/[0.05]'
  if (value <= 3) return 'bg-brand-orange/[0.2]'
  if (value <= 5) return 'bg-brand-orange/[0.5]'
  return 'bg-brand-orange/[0.8]'
}

// ── SVG chart helpers ────────────────────────────────────────

function buildSmoothPath(
  points: { x: number; y: number }[],
  close: boolean
): string {
  if (points.length < 2) return ''
  const d: string[] = [`M ${points[0].x},${points[0].y}`]

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`)
  }

  if (close) {
    const last = points[points.length - 1]
    const first = points[0]
    d.push(`L ${last.x},200 L ${first.x},200 Z`)
  }

  return d.join(' ')
}

// ── Component ────────────────────────────────────────────────

export default function LiveDemo() {
  const [visitors, setVisitors] = useState(2847)
  const [pageviews, setPageviews] = useState(8432)
  const [bounceRate, setBounceRate] = useState(42)
  const [avgDuration, setAvgDuration] = useState(154)
  const [realtimeVisitors, setRealtimeVisitors] = useState(12)
  const [chartData, setChartData] = useState(generateHourlyPattern)
  const heatmap = useRef(generateHeatmap())

  useEffect(() => {
    const id = setInterval(() => {
      setVisitors((v) => v + rand(1, 3))
      setPageviews((v) => v + rand(2, 5))
      setBounceRate(() => 38 + rand(0, 7))
      setAvgDuration(() => 130 + rand(0, 90))
      setRealtimeVisitors(() => 8 + rand(0, 7))
      setChartData((prev) => {
        const next = [...prev]
        const lastHourNum =
          parseInt(next[next.length - 1].hour.split(':')[0], 10)
        const newHour = (lastHourNum + 1) % 24
        next.push({
          hour: `${String(newHour).padStart(2, '0')}:00`,
          visitors: rand(20, 90),
          pageviews: rand(50, 250),
        })
        if (next.length > 24) next.shift()
        return next
      })
    }, 2500)
    return () => clearInterval(id)
  }, [])

  // ── Chart SVG ──────────────────────────────────────────────

  const chartW = 800
  const chartH = 200
  const maxVisitors = Math.max(...chartData.map((d) => d.visitors), 1)

  const chartPoints = chartData.map((d, i) => ({
    x: (i / (chartData.length - 1)) * chartW,
    y: chartH - (d.visitors / maxVisitors) * (chartH - 20) - 10,
  }))

  const linePath = buildSmoothPath(chartPoints, false)
  const areaPath = buildSmoothPath(chartPoints, true)

  // ── Stats config ───────────────────────────────────────────

  const stats = [
    {
      label: 'Visitors',
      value: visitors.toLocaleString(),
      change: '+12%',
      positive: true,
    },
    {
      label: 'Pageviews',
      value: pageviews.toLocaleString(),
      change: '+8%',
      positive: true,
    },
    {
      label: 'Bounce Rate',
      value: `${bounceRate}%`,
      change: '-3%',
      positive: false,
    },
    {
      label: 'Avg. Duration',
      value: fmtDuration(avgDuration),
      change: '+15%',
      positive: true,
    },
  ]

  const xLabels = chartData
    .map((d, i) => ({ label: d.hour, i }))
    .filter((d) => parseInt(d.label.split(':')[0], 10) % 4 === 0)

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="w-full max-h-[900px] overflow-hidden relative rounded-xl shadow-2xl">
      {/* Browser chrome */}
      <div className="bg-neutral-800 border-b border-neutral-800 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/20" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/20" />
          <span className="w-3 h-3 rounded-full bg-green-500/20" />
        </div>
        <div className="flex-1 bg-neutral-900/80 rounded-md px-3 py-1 text-xs text-neutral-500 text-center">
          pulse.ciphera.net/sites/demo
        </div>
      </div>

      {/* Dashboard body */}
      <div className="bg-neutral-950 px-6 py-5 space-y-5">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-lg">Ciphera</span>
            <span className="text-neutral-500 text-sm">ciphera.net</span>
            <span className="flex items-center gap-1.5 text-xs text-neutral-400 ml-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {realtimeVisitors} current visitors
            </span>
          </div>
          <span className="text-xs text-neutral-400 bg-neutral-800 px-3 py-1 rounded-full border border-white/[0.08]">
            Today
          </span>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-neutral-900/80 border border-white/[0.08] rounded-xl p-4"
            >
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                {s.label}
              </div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div
                className={`text-xs mt-1 ${
                  s.positive ? 'text-green-400' : 'text-orange-400'
                }`}
              >
                {s.positive ? '\u2191' : '\u2193'}
                {s.change.replace(/[+-]/, '')}
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6">
          <svg
            viewBox={`0 0 ${chartW} ${chartH + 30}`}
            className="w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="chartGrad"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#FD5E0F" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#FD5E0F" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#chartGrad)" />
            <path
              d={linePath}
              fill="none"
              stroke="#FD5E0F"
              strokeWidth="2"
            />
            {/* X-axis labels */}
            {xLabels.map(({ label, i }) => (
              <text
                key={label + i}
                x={(i / (chartData.length - 1)) * chartW}
                y={chartH + 22}
                fill="#525252"
                fontSize="11"
                textAnchor="middle"
              >
                {label}
              </text>
            ))}
          </svg>
        </div>

        {/* Two-column panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Top Pages */}
          <PanelCard title="Top Pages" items={topPages} />

          {/* Top Referrers */}
          <PanelCard title="Top Referrers" items={topReferrers} />

          {/* Locations */}
          <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
              Locations
            </h3>
            <div className="space-y-3">
              {locations.map((loc) => (
                <div key={loc.name}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lg">{loc.flag}</span>
                    <span className="text-neutral-300 text-sm flex-1">
                      {loc.name}
                    </span>
                    <span className="text-neutral-500 text-sm">
                      {loc.pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden ml-8">
                    <div
                      className="h-full bg-brand-orange rounded-full"
                      style={{ width: `${loc.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Technology */}
          <PanelCard title="Technology" items={technology} />

          {/* Campaigns */}
          <PanelCard title="Campaigns" items={campaigns} />

          {/* Peak Hours */}
          <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
              Peak Hours
            </h3>
            <div className="space-y-1">
              {heatmap.current.map((row, dayIdx) => (
                <div key={dayIdx} className="flex items-center gap-1">
                  <span className="text-[10px] text-neutral-500 w-6 shrink-0">
                    {dayLabels[dayIdx]}
                  </span>
                  <div className="flex gap-[2px] flex-1">
                    {row.map((val, hourIdx) => (
                      <div
                        key={hourIdx}
                        className={`w-3 h-3 rounded-sm ${heatmapOpacity(val)}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-neutral-950 to-transparent pointer-events-none" />
    </div>
  )
}

// ── Panel Card sub-component ─────────────────────────────────

function PanelCard({
  title,
  items,
}: {
  title: string
  items: { label: string; pct: number }[]
}) {
  return (
    <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-neutral-300">{item.label}</span>
              <span className="text-neutral-500">{item.pct}%</span>
            </div>
            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-orange rounded-full"
                style={{ width: `${item.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
