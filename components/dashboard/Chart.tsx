'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useTheme } from '@ciphera-net/ui'
import { Line, LineChart, XAxis, YAxis, ReferenceLine } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/line-charts-6'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatNumber, formatDuration, formatUpdatedAgo, DatePicker } from '@ciphera-net/ui'
import { Select, DownloadIcon, PlusIcon, XIcon } from '@ciphera-net/ui'
import { Checkbox } from '@ciphera-net/ui'
import { ArrowUpRight, ArrowDownRight } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const ANNOTATION_COLORS: Record<string, string> = {
  deploy: '#3b82f6',
  campaign: '#22c55e',
  incident: '#ef4444',
  other: '#a3a3a3',
}

const MAX_VISIBLE_ANNOTATIONS = 20

const ANNOTATION_LABELS: Record<string, string> = {
  deploy: 'Deploy',
  campaign: 'Campaign',
  incident: 'Incident',
  other: 'Note',
}

const CATEGORY_OPTIONS = [
  { value: 'deploy', label: 'Deploy' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'incident', label: 'Incident' },
  { value: 'other', label: 'Other' },
]

interface AnnotationData {
  id: string
  date: string
  time?: string | null
  text: string
  category: string
}

export interface DailyStat {
  date: string
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
}

interface Stats {
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
}

interface ChartProps {
  data: DailyStat[]
  prevData?: DailyStat[]
  stats: Stats
  prevStats?: Stats
  interval: 'minute' | 'hour' | 'day' | 'month'
  dateRange: { start: string, end: string }
  period?: string
  todayInterval: 'minute' | 'hour'
  setTodayInterval: (interval: 'minute' | 'hour') => void
  multiDayInterval: 'hour' | 'day'
  setMultiDayInterval: (interval: 'hour' | 'day') => void
  onExportChart?: () => void
  lastUpdatedAt?: number | null
  annotations?: AnnotationData[]
  canManageAnnotations?: boolean
  onCreateAnnotation?: (data: { date: string; time?: string; text: string; category: string }) => Promise<void>
  onUpdateAnnotation?: (id: string, data: { date: string; time?: string; text: string; category: string }) => Promise<void>
  onDeleteAnnotation?: (id: string) => Promise<void>
}

type MetricType = 'pageviews' | 'visitors' | 'bounce_rate' | 'avg_duration'

// ─── Helpers ─────────────────────────────────────────────────────────

function formatEU(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// ─── Metric configurations ──────────────────────────────────────────

const METRIC_CONFIGS: {
  key: MetricType
  label: string
  format: (v: number) => string
  isNegative?: boolean
}[] = [
  { key: 'visitors', label: 'Unique Visitors', format: (v) => formatNumber(v) },
  { key: 'pageviews', label: 'Total Pageviews', format: (v) => formatNumber(v) },
  { key: 'bounce_rate', label: 'Bounce Rate', format: (v) => `${Math.round(v)}%`, isNegative: true },
  { key: 'avg_duration', label: 'Visit Duration', format: (v) => formatDuration(v) },
]

const chartConfig = {
  visitors: { label: 'Unique Visitors', color: '#FD5E0F' },
  pageviews: { label: 'Total Pageviews', color: '#FD5E0F' },
  bounce_rate: { label: 'Bounce Rate', color: '#FD5E0F' },
  avg_duration: { label: 'Visit Duration', color: '#FD5E0F' },
} satisfies ChartConfig

// ─── Custom Tooltip ─────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
  metric: MetricType
}

function CustomTooltip({ active, payload, metric }: TooltipProps) {
  if (active && payload && payload.length) {
    const entry = payload[0]
    const config = METRIC_CONFIGS.find((m) => m.key === metric)

    if (config) {
      return (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 shadow-sm shadow-black/5 min-w-[120px]">
          <div className="flex items-center gap-2 text-sm">
            <div className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
            <span className="text-neutral-500 dark:text-neutral-400">{config.label}:</span>
            <span className="font-semibold text-neutral-900 dark:text-white">{config.format(entry.value)}</span>
          </div>
        </div>
      )
    }
  }
  return null
}

// ─── Chart Component ─────────────────────────────────────────────────

export default function Chart({
  data,
  prevData,
  stats,
  prevStats,
  interval,
  dateRange,
  period,
  todayInterval,
  setTodayInterval,
  multiDayInterval,
  setMultiDayInterval,
  onExportChart,
  lastUpdatedAt,
  annotations,
  canManageAnnotations,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: ChartProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const [showComparison, setShowComparison] = useState(false)

  // Tick every 1s so "Live · Xs ago" counts in real time (scoped to Chart only)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (lastUpdatedAt == null) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [lastUpdatedAt])

  // ─── Annotation state ─────────────────────────────────────────────
  const [annotationForm, setAnnotationForm] = useState<{
    visible: boolean; editingId?: string; date: string; time: string; text: string; category: string
  }>({ visible: false, date: new Date().toISOString().slice(0, 10), time: '', text: '', category: 'other' })
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; date: string } | null>(null)

  // Close context menu and annotation form on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (calendarOpen) { setCalendarOpen(false); return }
        if (contextMenu) { setContextMenu(null); return }
        if (annotationForm.visible) { setAnnotationForm(f => ({ ...f, visible: false })); return }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [calendarOpen, contextMenu, annotationForm.visible])

  const handleExportChart = useCallback(async () => {
    if (onExportChart) { onExportChart(); return }
    if (!chartContainerRef.current) return
    try {
      const { toPng } = await import('html-to-image')
      const bg = getComputedStyle(chartContainerRef.current).backgroundColor || (resolvedTheme === 'dark' ? '#171717' : '#ffffff')
      const dataUrl = await toPng(chartContainerRef.current, {
        cacheBust: true,
        backgroundColor: bg,
      })
      const link = document.createElement('a')
      link.download = `chart-${dateRange.start}-${dateRange.end}.png`
      link.href = dataUrl
      link.click()
    } catch { /* noop */ }
  }, [onExportChart, dateRange, resolvedTheme])

  // ─── Data ──────────────────────────────────────────────────────────

  const chartData = useMemo(() => data.map((item) => {
    let formattedDate: string
    if (interval === 'minute') {
      formattedDate = new Date(item.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else if (interval === 'hour') {
      const d = new Date(item.date)
      const isMidnight = d.getHours() === 0 && d.getMinutes() === 0
      formattedDate = isMidnight
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' 12:00 AM'
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' })
    } else {
      formattedDate = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return {
      date: formattedDate,
      originalDate: item.date,
      pageviews: item.pageviews,
      visitors: item.visitors,
      bounce_rate: item.bounce_rate,
      avg_duration: item.avg_duration,
    }
  }), [data, interval])

  const annotationMarkers = useMemo(() => {
    if (!annotations?.length) return []
    const byDate = new Map<string, AnnotationData[]>()
    for (const a of annotations) {
      const existing = byDate.get(a.date) || []
      existing.push(a)
      byDate.set(a.date, existing)
    }
    const markers: { x: string; annotations: AnnotationData[] }[] = []
    for (const [date, anns] of byDate) {
      const match = chartData.find((d) => {
        const orig = d.originalDate
        return orig.startsWith(date) || orig === date
      })
      if (match) {
        markers.push({ x: match.date, annotations: anns })
      }
    }
    return markers
  }, [annotations, chartData])

  const visibleAnnotationMarkers = annotationMarkers.slice(0, MAX_VISIBLE_ANNOTATIONS)
  const hiddenAnnotationCount = Math.max(0, annotationMarkers.length - MAX_VISIBLE_ANNOTATIONS)

  // ─── Right-click handler ──────────────────────────────────────────
  const handleChartContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canManageAnnotations) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const leftMargin = 48
    const rightMargin = 16
    const plotWidth = rect.width - leftMargin - rightMargin
    const fraction = Math.max(0, Math.min(1, (relX - leftMargin) / plotWidth))
    const index = Math.min(Math.round(fraction * (chartData.length - 1)), chartData.length - 1)
    const point = chartData[index]
    if (point) {
      setContextMenu({ x: e.clientX, y: e.clientY, date: point.originalDate.slice(0, 10) })
    }
  }, [canManageAnnotations, chartData])

  // ─── Annotation form handlers ─────────────────────────────────────
  const handleSaveAnnotation = useCallback(async () => {
    if (saving) return
    const payload = {
      date: annotationForm.date,
      time: annotationForm.time || undefined,
      text: annotationForm.text.trim(),
      category: annotationForm.category,
    }
    setSaving(true)
    try {
      if (annotationForm.editingId && onUpdateAnnotation) {
        await onUpdateAnnotation(annotationForm.editingId, payload)
      } else if (onCreateAnnotation) {
        await onCreateAnnotation(payload)
      }
      setAnnotationForm({ visible: false, date: '', time: '', text: '', category: 'other' })
    } finally {
      setSaving(false)
    }
  }, [annotationForm, saving, onCreateAnnotation, onUpdateAnnotation])

  const handleDeleteAnnotation = useCallback(async () => {
    if (!annotationForm.editingId || !onDeleteAnnotation) return
    setSaving(true)
    try {
      await onDeleteAnnotation(annotationForm.editingId)
      setAnnotationForm({ visible: false, date: '', time: '', text: '', category: 'other' })
    } finally {
      setSaving(false)
    }
  }, [annotationForm.editingId, onDeleteAnnotation])

  // ─── Metrics with trends ──────────────────────────────────────────

  const metricsWithTrends = useMemo(() => METRIC_CONFIGS.map((m) => {
    const value = stats[m.key]
    const previousValue = prevStats?.[m.key]
    const change = previousValue != null && previousValue > 0
      ? ((value - previousValue) / previousValue) * 100
      : null
    const isPositive = change !== null ? (m.isNegative ? change < 0 : change > 0) : null

    return {
      ...m,
      value,
      previousValue,
      change,
      isPositive,
    }
  }), [stats, prevStats])

  const hasData = data.length > 0
  const hasAnyNonZero = hasData && chartData.some((d) => (d[metric] as number) > 0
  )

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div ref={chartContainerRef} className="relative">
      <Card className="w-full overflow-hidden rounded-2xl">
        <CardHeader className="p-0 mb-0">
          {/* Metrics Grid - 21st.dev style */}
          <div className="grid grid-cols-2 md:grid-cols-4 grow w-full">
            {metricsWithTrends.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'relative cursor-pointer flex-1 text-start p-4 border-b md:border-b-0 md:border-r md:last:border-r-0 border-neutral-200 dark:border-neutral-800 transition-all',
                  metric === m.key && 'bg-neutral-50 dark:bg-neutral-800/40',
                )}
              >
                <div className={cn('text-[10px] font-semibold uppercase tracking-widest mb-2', metric === m.key ? 'text-brand-orange' : 'text-neutral-400 dark:text-neutral-500')}>{m.label}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-neutral-900 dark:text-white">{m.format(m.value)}</span>
                  {m.change !== null && (
                    <span className={cn('flex items-center gap-0.5 text-sm font-semibold', m.isPositive ? 'text-[#10B981]' : 'text-[#EF4444]')}>
                      {m.isPositive ? <ArrowUpRight weight="bold" className="size-3.5" /> : <ArrowDownRight weight="bold" className="size-3.5" />}
                      {Math.abs(m.change).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">{
                  period === 'today' ? 'vs yesterday'
                  : period === 'week' ? 'vs last week'
                  : period === 'month' ? 'vs last month'
                  : period === '7' ? 'vs previous 7 days'
                  : period === '30' ? 'vs previous 30 days'
                  : (() => {
                      const days = Math.round((new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / 86400000)
                      return days === 0 ? 'vs yesterday' : `vs previous ${days} days`
                    })()
                }</div>
                {metric === m.key && (
                  <motion.div
                    layoutId="activeMetric"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="px-2.5 py-4 relative overflow-hidden">
          {/* Subtle horizontal lines background */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 39px, var(--chart-grid) 39px, var(--chart-grid) 40px)',
              opacity: 0.5,
              maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)',
            }}
          />
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-4 px-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {METRIC_CONFIGS.find((m) => m.key === metric)?.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {dateRange.start === dateRange.end ? (
                <Select
                  value={todayInterval}
                  onChange={(value) => setTodayInterval(value as 'minute' | 'hour')}
                  options={[
                    { value: 'minute', label: '1 min' },
                    { value: 'hour', label: '1 hour' },
                  ]}
                  className="min-w-[90px]"
                />
              ) : (
                <Select
                  value={multiDayInterval}
                  onChange={(value) => setMultiDayInterval(value as 'hour' | 'day')}
                  options={[
                    { value: 'hour', label: '1 hour' },
                    { value: 'day', label: '1 day' },
                  ]}
                  className="min-w-[90px]"
                />
              )}

              {prevData?.length ? (
                <Checkbox
                  checked={showComparison}
                  onCheckedChange={setShowComparison}
                  label="Compare"
                />
              ) : null}

              <button
                onClick={handleExportChart}
                disabled={!hasData}
                className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors disabled:opacity-30 cursor-pointer"
                title="Export chart as PNG"
              >
                <DownloadIcon className="w-4 h-4" />
              </button>

              {canManageAnnotations && (
                <button
                  onClick={() => setAnnotationForm({ visible: true, date: new Date().toISOString().slice(0, 10), time: '', text: '', category: 'other' })}
                  className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer"
                  title="Add annotation"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {!hasData || !hasAnyNonZero ? (
            <div className="flex h-96 flex-col items-center justify-center gap-2">
              <p className="text-sm text-neutral-400 dark:text-neutral-500">
                {!hasData ? 'No data for this period' : `No ${METRIC_CONFIGS.find((m) => m.key === metric)?.label.toLowerCase()} recorded`}
              </p>
            </div>
          ) : (
            <div className="w-full" onContextMenu={handleChartContextMenu}>
              <ChartContainer
                config={chartConfig}
                className="h-96 w-full overflow-visible [&_.recharts-curve.recharts-tooltip-cursor]:stroke-[initial]"
              >
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 20, left: 5, bottom: 20 }}
                  style={{ overflow: 'visible' }}
                >
                  <defs>
                    <filter id="lineShadow" x="-100%" y="-100%" width="300%" height="300%">
                      <feDropShadow
                        dx="4"
                        dy="6"
                        stdDeviation="25"
                        floodColor={`${chartConfig[metric]?.color}60`}
                      />
                    </filter>
                    <filter id="dotShadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" />
                    </filter>
                  </defs>

                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                    tickMargin={10}
                    minTickGap={32}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                    tickMargin={10}
                    tickCount={6}
                    tickFormatter={(value) => {
                      const config = METRIC_CONFIGS.find((m) => m.key === metric)
                      return config ? config.format(value) : value.toString()
                    }}
                  />

                  <ChartTooltip content={<CustomTooltip metric={metric} />} cursor={{ strokeDasharray: '3 3', stroke: '#9ca3af' }} />


                  {/* Annotation reference lines */}
                  {visibleAnnotationMarkers.map((marker) => {
                    const primaryCategory = marker.annotations[0].category
                    const color = ANNOTATION_COLORS[primaryCategory] || ANNOTATION_COLORS.other
                    return (
                      <ReferenceLine
                        key={`ann-${marker.x}`}
                        x={marker.x}
                        stroke={color}
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        strokeOpacity={0.6}
                      />
                    )
                  })}

                  <Line
                    type="monotone"
                    dataKey={metric}
                    stroke={chartConfig[metric]?.color}
                    strokeWidth={2}
                    filter="url(#lineShadow)"
                    dot={false}
                    activeDot={{
                      r: 6,
                      fill: chartConfig[metric]?.color,
                      stroke: 'white',
                      strokeWidth: 2,
                      filter: 'url(#dotShadow)',
                    }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>

        {/* Footer: Annotations + Live indicator on same row */}
        {(annotationMarkers.length > 0 || lastUpdatedAt != null) && (
          <div className="px-4 sm:px-6 flex items-center justify-between gap-2 flex-wrap py-1.5 border-t border-neutral-100 dark:border-neutral-800">
            {/* Annotations left */}
            <div className="flex items-center gap-1 flex-wrap">
              {annotationMarkers.length > 0 && (
                <>
                  <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mr-1">Annotations:</span>
                  {visibleAnnotationMarkers.map((marker) => {
                    const primary = marker.annotations[0]
                    const color = ANNOTATION_COLORS[primary.category] || ANNOTATION_COLORS.other
                    const count = marker.annotations.length
                    return (
                      <button
                        key={`ann-btn-${marker.x}`}
                        type="button"
                        className="relative group inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        onClick={() => {
                          if (canManageAnnotations) {
                            setAnnotationForm({
                              visible: true,
                              editingId: primary.id,
                              date: primary.date,
                              time: primary.time || '',
                              text: primary.text,
                              category: primary.category,
                            })
                          }
                        }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="max-w-[120px] truncate">{primary.text}</span>
                        {count > 1 && <span className="text-neutral-400">+{count - 1}</span>}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 pointer-events-none">
                          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 min-w-[180px] max-w-[240px]">
                            {marker.annotations.map((a) => (
                              <div key={a.id} className="flex items-start gap-1.5 text-[11px] mb-1 last:mb-0">
                                <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: ANNOTATION_COLORS[a.category] || ANNOTATION_COLORS.other }} />
                                <div>
                                  <span className="font-medium text-neutral-400 dark:text-neutral-500">
                                    {ANNOTATION_LABELS[a.category] || 'Note'} &middot; {formatEU(a.date)}{a.time ? ` at ${a.time}` : ''}
                                  </span>
                                  <p className="text-neutral-900 dark:text-white">{a.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {hiddenAnnotationCount > 0 && (
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 ml-1">
                      +{hiddenAnnotationCount} more
                    </span>
                  )}
                </>
              )}
            </div>
            {/* Live indicator right */}
            {lastUpdatedAt != null && (
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                Live · {formatUpdatedAgo(lastUpdatedAt)}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ─── Right-click Context Menu ──────────────────────────────── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }} />
          <div
            className="fixed z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
              onClick={() => {
                setAnnotationForm({ visible: true, date: contextMenu.date, time: '', text: '', category: 'other' })
                setContextMenu(null)
              }}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add annotation ({formatEU(contextMenu.date)})
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
              onClick={() => {
                handleExportChart()
                setContextMenu(null)
              }}
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Export chart
            </button>
          </div>
        </>
      )}

      {/* ─── Annotation Form Modal ─────────────────────────────────── */}
      {annotationForm.visible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 rounded-2xl">
          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl p-5 w-[340px] max-w-[90%]">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              {annotationForm.editingId ? 'Edit annotation' : 'Add annotation'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Date</label>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(true)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 text-left flex items-center justify-between"
                >
                  <span>{annotationForm.date ? formatEU(annotationForm.date) : 'Select date'}</span>
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                  Time <span className="text-neutral-400 dark:text-neutral-500">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={annotationForm.time}
                    onChange={(e) => setAnnotationForm((f) => ({ ...f, time: e.target.value }))}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                  {annotationForm.time && (
                    <button
                      type="button"
                      onClick={() => setAnnotationForm((f) => ({ ...f, time: '' }))}
                      className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                      title="Clear time"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Note</label>
                <input
                  type="text"
                  value={annotationForm.text}
                  onChange={(e) => setAnnotationForm((f) => ({ ...f, text: e.target.value.slice(0, 200) }))}
                  placeholder="e.g. Launched new homepage"
                  maxLength={200}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  autoFocus
                />
                <span className="text-[10px] text-neutral-400 mt-0.5 block text-right">{annotationForm.text.length}/200</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Category</label>
                <Select
                  value={annotationForm.category}
                  onChange={(v) => setAnnotationForm((f) => ({ ...f, category: v }))}
                  options={CATEGORY_OPTIONS}
                  variant="input"
                  fullWidth
                  align="left"
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div>
                {annotationForm.editingId && (
                  <button
                    type="button"
                    onClick={handleDeleteAnnotation}
                    disabled={saving}
                    className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium cursor-pointer disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnnotationForm({ visible: false, date: '', time: '', text: '', category: 'other' })}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!annotationForm.text.trim() || !annotationForm.date || saving}
                  onClick={handleSaveAnnotation}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange/90 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : annotationForm.editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── DatePicker overlay ─────────────────────── */}
      <DatePicker
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onApply={() => {}}
        initialRange={{ start: annotationForm.date || new Date().toISOString().slice(0, 10), end: annotationForm.date || new Date().toISOString().slice(0, 10) }}
        mode="single"
        onSelect={(date) => {
          setAnnotationForm((f) => ({ ...f, date }))
          setCalendarOpen(false)
        }}
      />
    </div>
  )
}
