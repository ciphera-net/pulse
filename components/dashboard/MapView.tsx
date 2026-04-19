'use client'

import { useMemo, useState, useCallback, memo } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { formatNumber } from '@ciphera-net/ui'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

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

function getCountryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

function getColor(intensity: number): string {
  if (intensity <= 0) return 'rgba(255, 255, 255, 0.04)'
  if (intensity < 0.3) return 'rgba(249, 115, 22, 0.18)'
  if (intensity < 0.5) return 'rgba(249, 115, 22, 0.35)'
  if (intensity < 0.7) return 'rgba(249, 115, 22, 0.55)'
  return 'rgba(249, 115, 22, 0.75)'
}

function MapView({ data, className, formatValue = formatNumber }: MapViewProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: string; pageviews: number } | null>(null)

  const trafficMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of data) {
      if (d.country && d.country !== 'Unknown') map[d.country] = d.pageviews
    }
    return map
  }, [data])

  const max = useMemo(() => Math.max(1, ...Object.values(trafficMap)), [trafficMap])

  const handleMouseEnter = useCallback((alpha2: string, value: number, e: React.MouseEvent) => {
    if (value > 0) {
      setTooltip({ x: e.clientX, y: e.clientY, country: alpha2, pageviews: value })
    }
  }, [])

  const handleMouseMove = useCallback((alpha2: string, value: number, e: React.MouseEvent) => {
    if (value > 0) {
      setTooltip({ x: e.clientX, y: e.clientY, country: alpha2, pageviews: value })
    }
  }, [])

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative', cursor: 'default' }}>
      <ComposableMap
        projectionConfig={{ rotate: [-12, 0, 0], scale: 145 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const alpha2 = NUM_TO_ALPHA2[geo.id] || ''
              const value = trafficMap[alpha2] || 0
              const intensity = value > 0 ? 0.15 + (value / max) * 0.85 : 0
              const hasTraffic = value > 0
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getColor(intensity)}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none', cursor: hasTraffic ? 'pointer' : 'default' },
                    hover: { outline: 'none', fill: hasTraffic ? 'rgba(249, 115, 22, 0.85)' : 'rgba(255, 255, 255, 0.06)', cursor: hasTraffic ? 'pointer' : 'default' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseEnter={(e) => handleMouseEnter(alpha2, value, e)}
                  onMouseMove={(e) => handleMouseMove(alpha2, value, e)}
                  onMouseLeave={handleMouseLeave}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 text-xs font-medium text-white bg-neutral-800/95 border border-neutral-700 rounded-lg shadow-lg backdrop-blur-sm pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 28 }}
        >
          <span>{getCountryName(tooltip.country)}</span>
          <span className="ml-2 text-brand-orange font-bold">{formatValue(tooltip.pageviews)}</span>
        </div>
      )}
    </div>
  )
}

export default memo(MapView)
