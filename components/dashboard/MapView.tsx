'use client'

import { useMemo, useState, useCallback } from 'react'
import MapGL, { Marker, type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatNumber } from '@ciphera-net/ui'
import { countryCentroids } from '@/lib/country-centroids'

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const INITIAL_VIEW = {
  longitude: 20,
  latitude: 25,
  zoom: 1.3,
}

interface MapViewProps {
  data: Array<{ country: string; pageviews: number }>
  className?: string
  formatValue?: (value: number) => string
}

function getCountryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

export default function MapView({ data, className, formatValue = formatNumber }: MapViewProps) {
  const [tooltip, setTooltip] = useState<{ country: string; pageviews: number; lng: number; lat: number } | null>(null)

  const markers = useMemo(() => {
    if (!data.length) return []
    const max = Math.max(...data.map((d) => d.pageviews))
    if (max === 0) return []

    return data
      .filter((d) => d.country && d.country !== 'Unknown' && countryCentroids[d.country])
      .map((d) => ({
        lng: countryCentroids[d.country].lng,
        lat: countryCentroids[d.country].lat,
        country: d.country,
        pageviews: d.pageviews,
        size: 6 + (d.pageviews / max) * 18,
      }))
  }, [data])

  const handleMove = useCallback(() => setTooltip(null), [])

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: 260 }}>
      <MapGL
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%', borderRadius: 12 }}
        mapStyle={STYLE_URL}
        attributionControl={false}
        onMove={handleMove}
        maxZoom={6}
        minZoom={1}
      >
        {markers.map((m) => (
          <Marker key={m.country} longitude={m.lng} latitude={m.lat} anchor="center">
            <div
              className="cursor-pointer"
              onMouseEnter={() => setTooltip(m)}
              onMouseLeave={() => setTooltip(null)}
              style={{
                width: m.size,
                height: m.size,
                borderRadius: '50%',
                background: 'rgba(253, 94, 15, 0.7)',
                boxShadow: '0 0 8px rgba(253, 94, 15, 0.5), 0 0 20px rgba(253, 94, 15, 0.2)',
                border: '1px solid rgba(253, 94, 15, 0.9)',
              }}
            />
          </Marker>
        ))}
      </MapGL>

      {tooltip && (
        <div className="absolute top-3 left-3 z-10 px-3 py-2 text-xs font-medium text-white bg-neutral-900/90 border border-neutral-700 rounded-lg shadow-lg backdrop-blur-sm">
          <span>{getCountryName(tooltip.country)}</span>
          <span className="ml-2 text-brand-orange font-bold">{formatValue(tooltip.pageviews)}</span>
        </div>
      )}
    </div>
  )
}
