'use client'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import MapGL, { Source, Layer, type MapRef } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatNumber } from '@ciphera-net/ui'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'

const COUNTRIES_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }],
}

const INITIAL_VIEW = { longitude: 20, latitude: 15, zoom: 0.55 }

// Countries that cross the antimeridian — their polygons stretch across the map
const ANTIMERIDIAN_COUNTRIES = new Set(['010', '016', '028', '242', '258', '296', '520', '570', '583', '584', '585', '643', '798', '876', '882'])

const NUM_TO_ALPHA2: Record<string, string> = {
  '004':'AF','008':'AL','012':'DZ','016':'AS','020':'AD','024':'AO','028':'AG','031':'AZ','032':'AR','036':'AU',
  '040':'AT','044':'BS','048':'BH','050':'BD','051':'AM','052':'BB','056':'BE','060':'BM','064':'BT','068':'BO',
  '070':'BA','072':'BW','076':'BR','084':'BZ','090':'SB','092':'VG','096':'BN','100':'BG','104':'MM','108':'BI',
  '112':'BY','116':'KH','120':'CM','124':'CA','132':'CV','140':'CF','144':'LK','148':'TD','152':'CL','156':'CN',
  '158':'TW','170':'CO','174':'KM','178':'CG','180':'CD','184':'CK','188':'CR','191':'HR','192':'CU','196':'CY',
  '203':'CZ','204':'BJ','208':'DK','212':'DM','214':'DO','218':'EC','222':'SV','226':'GQ','231':'ET','232':'ER',
  '233':'EE','234':'FO','238':'FK','242':'FJ','246':'FI','250':'FR','254':'GF','258':'PF','262':'DJ','266':'GA',
  '268':'GE','270':'GM','275':'PS','276':'DE','288':'GH','292':'GI','296':'KI','300':'GR','304':'GL','308':'GD',
  '312':'GP','316':'GU','320':'GT','324':'GN','328':'GY','332':'HT','336':'VA','340':'HN','344':'HK','348':'HU',
  '352':'IS','356':'IN','360':'ID','364':'IR','368':'IQ','372':'IE','376':'IL','380':'IT','384':'CI','388':'JM',
  '392':'JP','398':'KZ','400':'JO','404':'KE','408':'KP','410':'KR','414':'KW','417':'KG','418':'LA','422':'LB',
  '426':'LS','428':'LV','430':'LR','434':'LY','438':'LI','440':'LT','442':'LU','446':'MO','450':'MG','454':'MW',
  '458':'MY','462':'MV','466':'ML','470':'MT','478':'MR','480':'MU','484':'MX','492':'MC','496':'MN','498':'MD',
  '499':'ME','504':'MA','508':'MZ','512':'OM','516':'NA','520':'NR','524':'NP','528':'NL','540':'NC','548':'VU',
  '554':'NZ','558':'NI','562':'NE','566':'NG','570':'NU','578':'NO','583':'FM','585':'PW','586':'PK','591':'PA',
  '598':'PG','600':'PY','604':'PE','608':'PH','616':'PL','620':'PT','624':'GW','626':'TL','630':'PR','634':'QA',
  '638':'RE','642':'RO','643':'RU','646':'RW','654':'SH','659':'KN','660':'AI','662':'LC','666':'PM','670':'VC',
  '674':'SM','678':'ST','682':'SA','686':'SN','688':'RS','690':'SC','694':'SL','702':'SG','703':'SK','704':'VN',
  '705':'SI','706':'SO','710':'ZA','716':'ZW','724':'ES','728':'SS','729':'SD','740':'SR','744':'SJ','748':'SZ',
  '752':'SE','756':'CH','760':'SY','762':'TJ','764':'TH','768':'TG','776':'TO','780':'TT','784':'AE','788':'TN',
  '792':'TR','795':'TM','798':'TV','800':'UG','804':'UA','807':'MK','818':'EG','826':'GB','834':'TZ','840':'US',
  '854':'BF','858':'UY','860':'UZ','862':'VE','876':'WF','882':'WS','887':'YE','894':'ZM',
}

function splitAntimeridianPolygon(coords: number[][][]): number[][][][] {
  const west: number[][][] = []
  const east: number[][][] = []
  for (const ring of coords) {
    const wRing: number[][] = []
    const eRing: number[][] = []
    for (const [lng, lat] of ring) {
      if (lng > 0) { eRing.push([lng, lat]); wRing.push([-180, lat]) }
      else { wRing.push([lng, lat]); eRing.push([180, lat]) }
    }
    if (eRing.length > 2) east.push(eRing)
    if (wRing.length > 2) west.push(wRing)
  }
  return [east, west].filter((p) => p.length > 0)
}

function fixAntimeridian(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const f of fc.features) {
    if (!ANTIMERIDIAN_COUNTRIES.has(f.id as string)) {
      features.push(f)
      continue
    }
    const geom = f.geometry
    if (geom.type === 'Polygon') {
      const parts = splitAntimeridianPolygon(geom.coordinates)
      for (const coords of parts) {
        features.push({ ...f, geometry: { type: 'Polygon', coordinates: coords } })
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        const hasAnti = polygon.some((ring) => ring.some(([lng]) => lng > 170) && ring.some(([lng]) => lng < -170))
        if (hasAnti) {
          const parts = splitAntimeridianPolygon(polygon)
          for (const coords of parts) {
            features.push({ ...f, geometry: { type: 'Polygon', coordinates: coords } })
          }
        } else {
          features.push({ ...f, geometry: { type: 'Polygon', coordinates: polygon } })
        }
      }
    } else {
      features.push(f)
    }
  }
  return { type: 'FeatureCollection', features }
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
  const mapRef = useRef<MapRef>(null)
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: string; pageviews: number } | null>(null)

  useEffect(() => {
    fetch(COUNTRIES_URL)
      .then((r) => r.json())
      .then((topo: Topology) => {
        const countries = feature(topo, topo.objects.countries as GeometryCollection)
        for (const f of countries.features) {
          f.properties = { ...f.properties, alpha2: NUM_TO_ALPHA2[f.id as string] || '' }
        }
        setGeoData(fixAntimeridian(countries as GeoJSON.FeatureCollection))
      })
      .catch(() => {})
  }, [])

  const trafficMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of data) {
      if (d.country && d.country !== 'Unknown') map[d.country] = d.pageviews
    }
    return map
  }, [data])

  const max = useMemo(() => Math.max(1, ...Object.values(trafficMap)), [trafficMap])

  const coloredGeoData = useMemo(() => {
    if (!geoData) return null
    return {
      ...geoData,
      features: geoData.features.map((f) => {
        const alpha2 = f.properties?.alpha2 as string
        const value = trafficMap[alpha2] || 0
        const intensity = value > 0 ? 0.15 + (value / max) * 0.65 : 0
        return { ...f, properties: { ...f.properties, intensity, value } }
      }),
    }
  }, [geoData, trafficMap, max])

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0]
    if (f?.properties?.alpha2 && f.properties.value > 0) {
      setTooltip({ x: e.point.x, y: e.point.y, country: f.properties.alpha2, pageviews: f.properties.value })
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer'
    } else {
      setTooltip(null)
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
  }, [])

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: 280, position: 'relative', overflow: 'hidden' }}>
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={EMPTY_STYLE}
        attributionControl={false}
        renderWorldCopies={false}
        interactiveLayerIds={coloredGeoData ? ['country-fill'] : []}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        scrollZoom={false}
        boxZoom={false}
        doubleClickZoom={false}
        dragPan={false}
        dragRotate={false}
        touchZoomRotate={false}
        keyboard={false}
        maxZoom={0.55}
        minZoom={0.55}
      >
        {coloredGeoData && (
          <Source id="countries" type="geojson" data={coloredGeoData}>
            <Layer
              id="country-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'case',
                  ['>', ['get', 'intensity'], 0],
                  ['interpolate', ['linear'], ['get', 'intensity'],
                    0.15, 'rgba(249, 115, 22, 0.15)',
                    0.40, 'rgba(249, 115, 22, 0.35)',
                    0.60, 'rgba(249, 115, 22, 0.55)',
                    0.80, 'rgba(249, 115, 22, 0.75)',
                  ],
                  'rgba(255, 255, 255, 0.04)',
                ],
              }}
            />
            <Layer
              id="country-border"
              type="line"
              paint={{
                'line-color': 'rgba(255, 255, 255, 0.06)',
                'line-width': 0.5,
              }}
            />
          </Source>
        )}
      </MapGL>

      {tooltip && (
        <div
          className="absolute z-10 px-3 py-2 text-xs font-medium text-white bg-neutral-800/95 border border-neutral-700 rounded-lg shadow-lg backdrop-blur-sm pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
        >
          <span>{getCountryName(tooltip.country)}</span>
          <span className="ml-2 text-brand-orange font-bold">{formatValue(tooltip.pageviews)}</span>
        </div>
      )}
    </div>
  )
}
