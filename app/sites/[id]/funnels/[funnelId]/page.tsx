'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ApiError } from '@/lib/api/client'
import { getFunnel, getFunnelStats, deleteFunnel, type Funnel, type FunnelStats } from '@/lib/api/funnels'
import { toast, LoadingOverlay, Select, DatePicker, ChevronLeftIcon, ArrowRightIcon, TrashIcon, useTheme, Button } from '@ciphera-net/ui'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts'
import { getDateRange } from '@/lib/utils/format'

const CHART_COLORS_LIGHT = {
  border: '#E5E5E5',
  axis: '#A3A3A3',
  tooltipBg: '#ffffff',
  tooltipBorder: '#E5E5E5',
}

const CHART_COLORS_DARK = {
  border: '#404040',
  axis: '#737373',
  tooltipBg: '#262626',
  tooltipBorder: '#404040',
}

const BRAND_ORANGE = '#FD5E0F'

export default function FunnelReportPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string
  const funnelId = params.funnelId as string

  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [stats, setStats] = useState<FunnelStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState(getDateRange(30))
  const [datePreset, setDatePreset] = useState<'7' | '30' | 'custom'>('30')
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [loadError, setLoadError] = useState<'not_found' | 'forbidden' | 'error' | null>(null)

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      setLoading(true)
      const [funnelData, statsData] = await Promise.all([
        getFunnel(siteId, funnelId),
        getFunnelStats(siteId, funnelId, dateRange.start, dateRange.end)
      ])
      setFunnel(funnelData)
      setStats(statsData)
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0
      if (status === 404) setLoadError('not_found')
      else if (status === 403) setLoadError('forbidden')
      else setLoadError('error')
      if (status !== 404 && status !== 403) toast.error('Failed to load funnel data')
    } finally {
      setLoading(false)
    }
  }, [siteId, funnelId, dateRange])

  useEffect(() => {
    loadData()
  }, [loadData])

  const { resolvedTheme } = useTheme()
  const chartColors = useMemo(
    () => (resolvedTheme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT),
    [resolvedTheme]
  )

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this funnel?')) return

    try {
      await deleteFunnel(siteId, funnelId)
      toast.success('Funnel deleted')
      router.push(`/sites/${siteId}/funnels`)
    } catch (error) {
      toast.error('Failed to delete funnel')
    }
  }

  if (loading && !funnel) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />
  }

  if (loadError === 'not_found' || (!funnel && !stats && !loadError)) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-neutral-600 dark:text-neutral-400">Funnel not found</p>
      </div>
    )
  }

  if (loadError === 'forbidden') {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-neutral-600 dark:text-neutral-400">Access denied</p>
        <Link href={`/sites/${siteId}/funnels`}>
          <Button variant="primary" className="mt-4">
            Back to Funnels
          </Button>
        </Link>
      </div>
    )
  }

  if (loadError === 'error') {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">Unable to load funnel</p>
        <Button type="button" onClick={() => loadData()} variant="primary">
          Try again
        </Button>
      </div>
    )
  }

  if (!funnel || !stats) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-neutral-600 dark:text-neutral-400">Funnel not found</p>
      </div>
    )
  }

  const chartData = stats.steps.map(s => ({
    name: s.step.name,
    visitors: s.visitors,
    dropoff: s.dropoff,
    conversion: s.conversion
  }))

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link 
              href={`/sites/${siteId}/funnels`}
              className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {funnel.name}
              </h1>
              {funnel.description && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  {funnel.description}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select
              value={datePreset}
              onChange={(value) => {
                if (value === '7') {
                  setDateRange(getDateRange(7))
                  setDatePreset('7')
                } else if (value === '30') {
                  setDateRange(getDateRange(30))
                  setDatePreset('30')
                } else if (value === 'custom') {
                  setIsDatePickerOpen(true)
                }
              }}
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            
            <button
              onClick={handleDelete}
              className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
              aria-label="Delete funnel"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm p-6 mb-8">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-6">
            Funnel Visualization
          </h3>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.border} />
                <XAxis 
                  dataKey="name" 
                  stroke={chartColors.axis} 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke={chartColors.axis} 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div
                          className="p-3 rounded-xl shadow-lg border"
                          style={{
                            backgroundColor: chartColors.tooltipBg,
                            borderColor: chartColors.tooltipBorder,
                          }}
                        >
                          <p className="font-medium text-neutral-900 dark:text-white mb-1">{label}</p>
                          <p className="text-brand-orange font-bold text-lg">
                            {data.visitors.toLocaleString()} visitors
                          </p>
                          {data.dropoff > 0 && (
                            <p className="text-red-500 text-sm">
                              {Math.round(data.dropoff)}% drop-off
                            </p>
                          )}
                          {data.conversion > 0 && (
                            <p className="text-green-500 text-sm">
                              {Math.round(data.conversion)}% conversion (overall)
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="visitors" radius={[4, 4, 0, 0]} barSize={60}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={BRAND_ORANGE} fillOpacity={Math.max(0.1, 1 - index * 0.15)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Stats Table */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-6 py-4 font-medium text-neutral-500 uppercase tracking-wider">Step</th>
                  <th className="px-6 py-4 font-medium text-neutral-500 uppercase tracking-wider text-right">Visitors</th>
                  <th className="px-6 py-4 font-medium text-neutral-500 uppercase tracking-wider text-right">Drop-off</th>
                  <th className="px-6 py-4 font-medium text-neutral-500 uppercase tracking-wider text-right">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {stats.steps.map((step, i) => (
                  <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-medium text-neutral-600 dark:text-neutral-400">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-white">{step.step.name}</p>
                          <p className="text-neutral-500 text-xs font-mono mt-0.5">{step.step.value}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {step.visitors.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {i > 0 ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          step.dropoff > 50 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'
                        }`}>
                          {Math.round(step.dropoff)}%
                        </span>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {Math.round(step.conversion)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={(range) => {
          setDateRange(range)
          setDatePreset('custom')
          setIsDatePickerOpen(false)
        }}
        initialRange={dateRange}
      />
    </div>
  )
}
