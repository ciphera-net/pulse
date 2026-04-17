'use client'

import { useCallback, useEffect, useState } from 'react'
import { getFunnelBreakdown, type FunnelBreakdown } from '@/lib/api/funnels'
import { DIMENSION_LABELS } from '@/lib/filters'
import { ChartPieSlice } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'

const BREAKDOWN_DIMENSIONS = [
  'device', 'country', 'browser', 'os',
  'utm_source', 'utm_medium', 'utm_campaign'
]

interface BreakdownDrawerProps {
  siteId: string
  funnelId: string
  stepIndex: number
  stepName: string
  startDate: string
  endDate: string
  filters?: string
  onClose: () => void
}

export default function BreakdownDrawer({ siteId, funnelId, stepIndex, stepName, startDate, endDate, filters, onClose }: BreakdownDrawerProps) {
  const [activeDimension, setActiveDimension] = useState('device')
  const [breakdown, setBreakdown] = useState<FunnelBreakdown | null>(null)
  const [loading, setLoading] = useState(true)

  const loadBreakdown = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFunnelBreakdown(siteId, funnelId, stepIndex, activeDimension, startDate, endDate, filters)
      setBreakdown(data)
    } catch {
      setBreakdown(null)
    } finally {
      setLoading(false)
    }
  }, [siteId, funnelId, stepIndex, activeDimension, startDate, endDate, filters])

  useEffect(() => {
    loadBreakdown()
  }, [loadBreakdown])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-96 max-w-full bg-neutral-900/80 border-l border-white/[0.08] shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h3 className="font-semibold text-white">Step Breakdown</h3>
            <p className="text-sm text-neutral-500">{stepName}</p>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Dimension tabs */}
        <div className="flex overflow-x-auto gap-1 px-6 py-3 border-b border-neutral-800">
          {BREAKDOWN_DIMENSIONS.map(dim => (
            <button
              key={dim}
              onClick={() => setActiveDimension(dim)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeDimension === dim
                  ? 'bg-brand-orange-button text-white'
                  : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
              } ease-apple`}
            >
              {DIMENSION_LABELS[dim] || dim}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-neutral-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !breakdown || breakdown.entries.length === 0 ? (
            <EmptyState
              title="No data for this dimension"
              icon={<ChartPieSlice weight="regular" />}
              className="py-6"
            />
          ) : (
            <div className="space-y-2">
              {breakdown.entries.map(entry => (
                <div key={entry.value} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-800/50">
                  <span className="text-sm text-white truncate mr-4">
                    {entry.value || '(unknown)'}
                  </span>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    <span className="text-neutral-500">{entry.visitors}</span>
                    <span className="text-green-400 font-medium w-16 text-right">
                      {Math.round(entry.conversion)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
