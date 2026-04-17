'use client'

import { useState, useEffect } from 'react'
import { formatNumber } from '@ciphera-net/ui'
import { getEventPropertyKeys, getEventPropertyValues, type EventPropertyKey, type EventPropertyValue } from '@/lib/api/stats'
import { ListBullets } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'

interface EventPropertiesProps {
  siteId: string
  eventName: string
  dateRange: { start: string; end: string }
  onClose: () => void
}

export default function EventProperties({ siteId, eventName, dateRange, onClose }: EventPropertiesProps) {
  const [keys, setKeys] = useState<EventPropertyKey[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [values, setValues] = useState<EventPropertyValue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getEventPropertyKeys(siteId, eventName, dateRange.start, dateRange.end)
      .then(k => {
        setKeys(k)
        if (k.length > 0) setSelectedKey(k[0].key)
      })
      .finally(() => setLoading(false))
  }, [siteId, eventName, dateRange.start, dateRange.end])

  useEffect(() => {
    if (!selectedKey) return
    getEventPropertyValues(siteId, eventName, selectedKey, dateRange.start, dateRange.end)
      .then(setValues)
  }, [siteId, eventName, selectedKey, dateRange.start, dateRange.end])

  const maxCount = values.length > 0 ? values[0].count : 1

  return (
    <div className="glass-surface rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          Properties: <span className="text-brand-orange">{eventName.replace(/_/g, ' ')}</span>
        </h3>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-300 transition-colors cursor-pointer ease-apple"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="animate-skeleton-fade space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-neutral-800 rounded-lg" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Custom properties will appear here as events fire."
          icon={<ListBullets weight="regular" />}
          className="py-4"
        />
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {keys.map(k => (
              <button
                key={k.key}
                onClick={() => setSelectedKey(k.key)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                  selectedKey === k.key
                    ? 'bg-brand-orange-button text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                } ease-apple`}
              >
                {k.key}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {values.map(v => (
              <div key={v.value} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white truncate">
                      {v.value}
                    </span>
                    <span className="text-xs font-semibold text-brand-orange tabular-nums ml-2">
                      {formatNumber(v.count)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-orange/60 rounded-full transition-[width] ease-apple"
                      style={{ width: `${(v.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
