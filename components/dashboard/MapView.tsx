'use client'

import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import { formatNumber } from '@ciphera-net/ui'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const worldJson = require('visionscarto-world-atlas/world/110m.json')

const WIDTH = 500
const HEIGHT = 320

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

interface MapViewProps {
  data: Array<{ country: string; pageviews: number }>
  className?: string
  formatValue?: (value: number) => string
}

type CountryFeature = { properties: { name: string; a3: string }; id: string }

function getCountryFeatures(): CountryFeature[] {
  const collection = topojson.feature(worldJson, worldJson.objects.countries)
  return (collection as unknown as GeoJSON.FeatureCollection).features as unknown as CountryFeature[]
}

function MapView({ data, className, formatValue = formatNumber }: MapViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const highlightRef = useRef<d3.Selection<SVGPathElement, unknown, null, undefined> | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; value: number } | null>(null)

  const trafficMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of data) {
      if (d.country && d.country !== 'Unknown') map[d.country] = d.pageviews
    }
    return map
  }, [data])

  const maxValue = useMemo(() => Math.max(1, ...Object.values(trafficMap)), [trafficMap])

  const getAlpha2 = useCallback((feature: CountryFeature) => {
    return NUM_TO_ALPHA2[feature.id] || ''
  }, [])

  // Draw the base map once on mount
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const projection = d3.geoMercator()
      .scale(78)
      .translate([WIDTH / 2, HEIGHT / 1.45])

    const path = d3.geoPath().projection(projection)
    const features = getCountryFeatures()

    svg.selectAll('path.country')
      .data(features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', path as unknown as string)
      .style('stroke', 'rgba(255,255,255,0.08)')
      .style('stroke-width', '0.5px')
      .style('fill', 'rgba(255,255,255,0.04)')
      .style('transition', 'fill 0.15s ease')

    highlightRef.current = svg.append('path')
      .style('fill', 'none')
      .style('stroke', 'rgba(249,115,22,0.6)')
      .style('stroke-width', '1.5px')
      .style('pointer-events', 'none')

    return () => { svg.selectAll('*').remove() }
  }, [])

  // Update colors when data changes
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    const colorScale = d3.scaleLinear<string>()
      .domain([0, maxValue])
      .range(['rgba(249,115,22,0.12)', 'rgba(249,115,22,0.75)'])

    svg.selectAll<SVGPathElement, CountryFeature>('path.country')
      .style('fill', (d) => {
        const alpha2 = getAlpha2(d)
        const value = trafficMap[alpha2] || 0
        return value > 0 ? colorScale(value) : 'rgba(255,255,255,0.04)'
      })
      .style('cursor', (d) => {
        const alpha2 = getAlpha2(d)
        return (trafficMap[alpha2] || 0) > 0 ? 'pointer' : 'default'
      })
      .on('mouseover', function (event, d) {
        const alpha2 = getAlpha2(d)
        const value = trafficMap[alpha2] || 0
        if (value > 0) {
          const [x, y] = d3.pointer(event, svgRef.current?.parentNode)
          setTooltip({ x, y, name: d.properties.name, value })
          highlightRef.current
            ?.attr('d', this.getAttribute('d'))
            .style('stroke', 'rgba(249,115,22,0.6)')
        }
      })
      .on('mousemove', function (event) {
        const [x, y] = d3.pointer(event, svgRef.current?.parentNode)
        setTooltip((prev) => prev ? { ...prev, x, y } : null)
      })
      .on('mouseout', function () {
        setTooltip(null)
        highlightRef.current?.attr('d', null)
      })
  }, [trafficMap, maxValue, getAlpha2])

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div className="relative flex justify-center items-center w-full" style={{ maxWidth: WIDTH }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          style={{ cursor: 'default' }}
        />
        {tooltip && (
          <div
            className="absolute z-10 px-3 py-2 text-xs font-medium text-white bg-neutral-800/95 border border-neutral-700 rounded-lg shadow-lg backdrop-blur-sm pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y - 36 }}
          >
            <span>{tooltip.name}</span>
            <span className="ml-2 text-brand-orange font-bold">{formatValue(tooltip.value)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(MapView)
