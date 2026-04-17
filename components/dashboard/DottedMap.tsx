'use client'

import { useMemo, useState } from 'react'
import { createMap } from 'svg-dotted-map'
import { cn, formatNumber } from '@ciphera-net/ui'
import { countryCentroids } from '@/lib/country-centroids'

// ─── Module-level constants ────────────────────────────────────────
// Computed once when the module loads, survives component unmount/remount.
const MAP_WIDTH = 150
const MAP_HEIGHT = 68
const DOT_RADIUS = 0.25

const { points: MAP_POINTS, addMarkers } = createMap({ width: MAP_WIDTH, height: MAP_HEIGHT, mapSamples: 8000 })

// Pre-compute stagger helpers (row offsets for hex-grid pattern)
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

// Pre-compute the base map dots as a single SVG path string (~8000 circles → 1 path)
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

// ─── Component ─────────────────────────────────────────────────────

interface DottedMapProps {
  data: Array<{ country: string; pageviews: number }>
  className?: string
  /** Custom formatter for tooltip values. Defaults to formatNumber. */
  formatValue?: (value: number) => string
}

function getCountryName(code: string): string {
  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
    return regionNames.of(code) || code
  } catch {
    return code
  }
}

export default function DottedMap({ data, className, formatValue = formatNumber }: DottedMapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: string; pageviews: number } | null>(null)

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

  const processedMarkers = useMemo(
    () => addMarkers(markerData.map((d) => ({ lat: d.lat, lng: d.lng, size: d.size }))),
    [markerData],
  )

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className={cn('text-neutral-500', className)}
        style={{ width: '100%', height: '100%' }}
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
        <path
          d={BASE_DOTS_PATH}
          fill="currentColor"
        />
        {processedMarkers.map((marker, index) => {
          const rowIndex = _stagger.yToRowIndex.get(marker.y) ?? 0
          const offsetX = rowIndex % 2 === 1 ? _stagger.xStep / 2 : 0
          const info = markerData[index]
          const cx = marker.x + offsetX
          const cy = marker.y
          return (
            <g
              key={`marker-${marker.x}-${marker.y}-${index}`}
              className="cursor-pointer"
              onMouseEnter={(e) => {
                if (info) {
                  const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect()
                  setTooltip({
                    x: rect.left + (cx / MAP_WIDTH) * rect.width,
                    y: rect.top + (cy / MAP_HEIGHT) * rect.height,
                    country: info.country,
                    pageviews: info.pageviews,
                  })
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Invisible larger hitbox */}
              <circle cx={cx} cy={cy} r={2.5} fill="transparent" />
              {/* Visible dot */}
              <circle cx={cx} cy={cy} r={marker.size ?? DOT_RADIUS} fill="#FD5E0F" filter="url(#marker-glow)" />
            </g>
          )
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full -mt-2"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <span>{getCountryName(tooltip.country)}</span>
          <span className="ml-1.5 text-brand-orange font-bold">{formatValue(tooltip.pageviews)}</span>
        </div>
      )}
    </div>
  )
}
