'use client'

import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatNumber, formatDuration } from '@/lib/utils/format'
import { ArrowTopRightIcon, ArrowBottomRightIcon, DownloadIcon } from '@radix-ui/react-icons'

const COLORS = {
  brand: '#FD5E0F',
  success: '#10B981', // Emerald-500
  danger: '#EF4444',  // Red-500
  border: '#E5E5E5',  // Neutral-200
  text: '#171717',    // Neutral-900
  textMuted: '#737373', // Neutral-500
  axis: '#A3A3A3',    // Neutral-400
}

interface DailyStat {
  date: string
  pageviews: number
  visitors: number
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
  interval: 'hour' | 'day' | 'month'
}

type MetricType = 'pageviews' | 'visitors' | 'bounce_rate' | 'avg_duration'

export default function Chart({ data, prevData, stats, prevStats, interval }: ChartProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')

  // * Align current and previous data
  const chartData = data.map((item, i) => {
    // * Try to find matching previous item (assuming same length/order)
    // * For more robustness, we could match by relative index
    const prevItem = prevData && prevData[i]
    
    return {
      date: new Date(item.date).toLocaleDateString('en-US', interval === 'hour' ? { hour: 'numeric', minute: 'numeric' } : { month: 'short', day: 'numeric' }),
      originalDate: item.date,
      pageviews: item.pageviews,
      visitors: item.visitors,
      prevPageviews: prevItem?.pageviews,
      prevVisitors: prevItem?.visitors,
    }
  })

  // * Calculate trends
  const calculateTrend = (current: number, previous?: number) => {
    if (!previous) return null
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Pageviews,Visitors\n"
      + data.map(row => `${new Date(row.date).toISOString()},${row.pageviews},${row.visitors}`).join("\n")
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `analytics_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const metrics = [
    {
      id: 'visitors',
      label: 'Unique Visitors',
      value: formatNumber(stats.visitors),
      trend: calculateTrend(stats.visitors, prevStats?.visitors),
      color: COLORS.brand,
      invertTrend: false,
    },
    {
      id: 'pageviews',
      label: 'Total Pageviews',
      value: formatNumber(stats.pageviews),
      trend: calculateTrend(stats.pageviews, prevStats?.pageviews),
      color: COLORS.brand,
      invertTrend: false,
    },
    {
      id: 'bounce_rate',
      label: 'Bounce Rate',
      value: `${Math.round(stats.bounce_rate)}%`,
      trend: calculateTrend(stats.bounce_rate, prevStats?.bounce_rate),
      color: COLORS.danger,
      invertTrend: true, // Lower bounce rate is better
    },
    {
      id: 'avg_duration',
      label: 'Visit Duration',
      value: formatDuration(stats.avg_duration),
      trend: calculateTrend(stats.avg_duration, prevStats?.avg_duration),
      color: COLORS.success,
      invertTrend: false,
    },
  ] as const

  const activeMetric = metrics.find(m => m.id === metric) || metrics[0]

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm">
      {/* Stats Header (Interactive Tabs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-neutral-200 dark:divide-neutral-800 border-b border-neutral-200 dark:border-neutral-800">
        {metrics.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'visitors' || item.id === 'pageviews') {
                setMetric(item.id as MetricType)
              }
            }}
            className={`
              p-6 text-left transition-colors relative group
              hover:bg-neutral-50 dark:hover:bg-neutral-800/50
              ${metric === item.id ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}
              ${(item.id !== 'visitors' && item.id !== 'pageviews') ? 'cursor-default' : 'cursor-pointer'}
            `}
          >
            <div className={`text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2 ${metric === item.id ? 'text-neutral-900 dark:text-white' : 'text-neutral-500'}`}>
              {item.label}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                {item.value}
              </span>
              {item.trend !== null && (
                <span className={`flex items-center text-sm font-medium ${
                  (item.invertTrend ? -item.trend : item.trend) > 0 
                    ? 'text-emerald-600 dark:text-emerald-500' 
                    : (item.invertTrend ? -item.trend : item.trend) < 0 
                      ? 'text-red-600 dark:text-red-500' 
                      : 'text-neutral-500'
                }`}>
                  {(item.invertTrend ? -item.trend : item.trend) > 0 ? (
                     <ArrowTopRightIcon className="w-3 h-3 mr-0.5" />
                  ) : (item.invertTrend ? -item.trend : item.trend) < 0 ? (
                     <ArrowBottomRightIcon className="w-3 h-3 mr-0.5" />
                  ) : null}
                  {Math.abs(item.trend)}%
                </span>
              )}
            </div>
            {metric === item.id && (
               <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: item.color }} />
            )}
          </button>
        ))}
      </div>

      {/* Chart Area */}
      <div className="p-6 relative">
        <div className="absolute top-6 right-6 z-10">
          <button 
            onClick={handleExport}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Export to CSV"
          >
            <DownloadIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeMetric.color} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={activeMetric.color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.border} />
              <XAxis 
                dataKey="date" 
                stroke={COLORS.axis} 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                minTickGap={30}
              />
              <YAxis 
                stroke={COLORS.axis} 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(value) => value >= 1000 ? `${value/1000}k` : value}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  padding: '12px'
                }}
                itemStyle={{ color: COLORS.text, fontWeight: 600, fontSize: '14px' }}
                labelStyle={{ color: COLORS.textMuted, marginBottom: '8px', fontSize: '12px' }}
                cursor={{ stroke: activeMetric.color, strokeDasharray: '4 4' }}
              />
              
              {/* Previous Period Line (Dashed) */}
              {prevData && (
                <Area
                  type="monotone"
                  dataKey={metric === 'visitors' ? 'prevVisitors' : 'prevPageviews'}
                  stroke={COLORS.axis}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fill="none"
                  animationDuration={1000}
                />
              )}

              {/* Current Period Area */}
              <Area
                type="monotone"
                dataKey={metric}
                stroke={activeMetric.color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#gradient-${metric})`}
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
