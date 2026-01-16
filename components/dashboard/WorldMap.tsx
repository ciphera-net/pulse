'use client'

import React, { memo, useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { scaleLinear } from 'd3-scale'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import { useTheme } from 'next-themes'

countries.registerLocale(enLocale)

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

interface WorldMapProps {
  data: Array<{ country: string; pageviews: number }>
}

const WorldMap = ({ data }: WorldMapProps) => {
  const { resolvedTheme } = useTheme()
  const [tooltipContent, setTooltipContent] = useState<{ content: string; x: number; y: number } | null>(null)

  const processedData = useMemo(() => {
    const map = new Map<string, number>()
    let max = 0
    data.forEach(item => {
      if (item.country === 'Unknown') return
      // API returns 2 letter code. Convert to numeric (3 digits string)
      const numericCode = countries.alpha2ToNumeric(item.country)
      if (numericCode) {
        map.set(numericCode, item.pageviews)
        if (item.pageviews > max) max = item.pageviews
      }
    })
    return { map, max }
  }, [data])

  const colorScale = scaleLinear<string>()
    .domain([0, processedData.max || 1])
    .range(["#fed7aa", "#FD5E0F"]) // standard choropleth: darker = more visitors

  // Plausible-like colors based on provided SVG snippet
  const isDark = resolvedTheme === 'dark'
  const defaultFill = isDark ? "#2d2d2d" : "#F2F2F2" // Approx gray-750 / gray-150
  const defaultStroke = isDark ? "#171717" : "#FFFFFF" // gray-900 / white
  
  return (
    <div className="relative w-full">
      <ComposableMap 
        width={475} 
        height={335}
        projectionConfig={{ rotate: [-10, 0, 0], scale: 90, center: [0, 20] }}
        className="w-full h-auto"
      >
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies
              .filter(geo => geo.id !== "010") // Remove Antarctica
              .map((geo) => {
                const id = String(geo.id).padStart(3, '0')
                const count = processedData.map.get(id) || 0
              
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={count > 0 ? colorScale(count) : defaultFill}
                    stroke={defaultStroke}
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none", transition: "all 250ms" },
                      hover: { fill: "#FD5E0F", outline: "none", cursor: 'pointer' },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={(evt) => {
                       const { name } = geo.properties
                       setTooltipContent({
                         content: `${name}: ${count} visitors`,
                         x: evt.clientX,
                         y: evt.clientY
                       })
                    }}
                    onMouseLeave={() => {
                      setTooltipContent(null)
                    }}
                    onMouseMove={(evt) => {
                       setTooltipContent(prev => prev ? { ...prev, x: evt.clientX, y: evt.clientY } : null)
                    }}
                  />
                )
            })
          }
        </Geographies>
      </ComposableMap>
      {tooltipContent && (
         <div 
           className="fixed z-50 px-2 py-1 text-xs font-medium text-white bg-black/80 backdrop-blur-sm rounded shadow pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-10px]"
           style={{ left: tooltipContent.x, top: tooltipContent.y }}
         >
            {tooltipContent.content}
         </div>
      )}
    </div>
  )
}

export default memo(WorldMap)
