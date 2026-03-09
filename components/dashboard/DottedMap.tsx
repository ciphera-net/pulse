'use client'

import { useMemo } from 'react'
import { createMap } from 'svg-dotted-map'
import { cn } from '@ciphera-net/ui'
import { countryCentroids } from '@/lib/country-centroids'

interface DottedMapProps {
  data: Array<{ country: string; pageviews: number }>
  className?: string
}

export default function DottedMap({ data, className }: DottedMapProps) {
  const width = 150
  const height = 75
  const dotRadius = 0.2

  const { points, addMarkers } = createMap({ width, height, mapSamples: 5000 })

  const markers = useMemo(() => {
    if (!data.length) return []

    const max = Math.max(...data.map((d) => d.pageviews))
    if (max === 0) return []

    return data
      .filter((d) => d.country && d.country !== 'Unknown' && countryCentroids[d.country])
      .map((d) => ({
        lat: countryCentroids[d.country].lat,
        lng: countryCentroids[d.country].lng,
        size: 0.4 + (d.pageviews / max) * 0.8,
      }))
  }, [data])

  const processedMarkers = addMarkers(markers)

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
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('text-neutral-300 dark:text-neutral-700', className)}
      style={{ width: '100%', height: '100%' }}
    >
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
        return (
          <circle
            cx={marker.x + offsetX}
            cy={marker.y}
            r={marker.size ?? dotRadius}
            fill="#FD5E0F"
            key={`marker-${marker.x}-${marker.y}-${index}`}
          />
        )
      })}
    </svg>
  )
}
