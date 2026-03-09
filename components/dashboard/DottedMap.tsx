'use client'

import { useMemo, useState } from 'react'
import { createMap } from 'svg-dotted-map'
import { cn, formatNumber } from '@ciphera-net/ui'
import { countryCentroids } from '@/lib/country-centroids'

interface DottedMapProps {
  data: Array<{ country: string; pageviews: number }>
  className?: string
}

function getCountryName(code: string): string {
  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
    return regionNames.of(code) || code
  } catch {
    return code
  }
}

export default function DottedMap({ data, className }: DottedMapProps) {
  const width = 150
  const height = 68
  const dotRadius = 0.25
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: string; pageviews: number } | null>(null)

  const { points, addMarkers } = createMap({ width, height, mapSamples: 8000 })

  const markerData = useMemo(() => {
    if (!data.length) return []

    const max = Math.max(...data.map((d) => d.pageviews))
    if (max === 0) return []

    return data
      .filter((d) => d.country && d.country !== 'Unknown' && countryCentroids[d.country])
      .map((d) => ({
        lat: countryCentroids[d.country].lat,
        lng: countryCentroids[d.country].lng,
        size: 0.4 + (d.pageviews / max) * 0.8,
        country: d.country,
        pageviews: d.pageviews,
      }))
  }, [data])

  const markerInputs = useMemo(
    () => markerData.map((d) => ({ lat: d.lat, lng: d.lng, size: d.size })),
    [markerData],
  )
  const processedMarkers = addMarkers(markerInputs)

  // Compute stagger helpers
  const { xStep, yToRowIndex } = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x)
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
  }, [points])

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn('text-neutral-400 dark:text-neutral-500', className)}
        style={{ width: '100%', height: 'auto', maxHeight: '100%' }}
      >
        <defs>
          <filter id="marker-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 0.4 0 0 0  0 0 0 0 0  0 0 0 0.6 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {points.map((point, index) => {
          const rowIndex = yToRowIndex.get(point.y) ?? 0
          const offsetX = rowIndex % 2 === 1 ? xStep / 2 : 0
          return (
            <circle
              cx={point.x + offsetX}
              cy={point.y}
              r={dotRadius}
              fill="currentColor"
              key={`${point.x}-${point.y}-${index}`}
            />
          )
        })}
        {processedMarkers.map((marker, index) => {
          const rowIndex = yToRowIndex.get(marker.y) ?? 0
          const offsetX = rowIndex % 2 === 1 ? xStep / 2 : 0
          const info = markerData[index]
          return (
            <circle
              cx={marker.x + offsetX}
              cy={marker.y}
              r={marker.size ?? dotRadius}
              fill="#FD5E0F"
              filter="url(#marker-glow)"
              className="cursor-pointer"
              key={`marker-${marker.x}-${marker.y}-${index}`}
              onMouseEnter={(e) => {
                if (info) {
                  const rect = (e.target as SVGCircleElement).closest('svg')!.getBoundingClientRect()
                  const svgX = marker.x + offsetX
                  const svgY = marker.y
                  setTooltip({
                    x: rect.left + (svgX / width) * rect.width,
                    y: rect.top + (svgY / height) * rect.height,
                    country: info.country,
                    pageviews: info.pageviews,
                  })
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-neutral-900 dark:bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full -mt-2"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <span>{getCountryName(tooltip.country)}</span>
          <span className="ml-1.5 text-brand-orange font-bold">{formatNumber(tooltip.pageviews)}</span>
        </div>
      )}
    </div>
  )
}
