'use client'

import { useEffect, useRef } from 'react'
import createGlobe from 'cobe'
import { useTheme } from '@ciphera-net/ui'
import { countryCentroids } from '@/lib/country-centroids'

interface GlobeProps {
  data: Array<{ country: string; pageviews: number }>
  className?: string
}

export default function Globe({ data, className }: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phiRef = useRef(0)
  const dragRef = useRef(0)
  const pointerRef = useRef<number | null>(null)
  const { resolvedTheme } = useTheme()
  const isDarkRef = useRef(resolvedTheme === 'dark')
  const markersRef = useRef<Array<{ location: [number, number]; size: number }>>([])

  // Update refs without causing effect re-runs
  isDarkRef.current = resolvedTheme === 'dark'

  // Compute markers into ref
  const max = data.length ? Math.max(...data.map((d) => d.pageviews)) : 0
  markersRef.current = max > 0
    ? data
        .filter((d) => d.country && d.country !== 'Unknown' && countryCentroids[d.country])
        .map((d) => ({
          location: [countryCentroids[d.country].lat, countryCentroids[d.country].lng] as [number, number],
          size: 0.03 + (d.pageviews / max) * 0.12,
        }))
    : []

  useEffect(() => {
    if (!canvasRef.current) return

    const size = canvasRef.current.offsetWidth
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    const isDark = isDarkRef.current

    const globe = createGlobe(canvasRef.current, {
      width: size * pixelRatio,
      height: size * pixelRatio,
      devicePixelRatio: pixelRatio,
      phi: phiRef.current,
      theta: 0.3,
      dark: isDark ? 1 : 0,
      diffuse: isDark ? 2 : 0.4,
      mapSamples: 16000,
      mapBrightness: isDark ? 2 : 1.2,
      baseColor: isDark ? [0.5, 0.5, 0.5] : [1, 1, 1],
      markerColor: [253 / 255, 94 / 255, 15 / 255],
      glowColor: isDark ? [0.15, 0.15, 0.15] : [1, 1, 1],
      markers: markersRef.current,
      onRender: (state) => {
        if (!pointerRef.current) phiRef.current += 0.002
        state.phi = phiRef.current + dragRef.current
      },
    })

    setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '1'
    }, 0)

    return () => { globe.destroy() }
  // Only recreate on theme change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme])

  return (
    <div className={`relative w-full h-full overflow-hidden ${className ?? ''}`}>
      <div className="absolute left-1/2 -translate-x-1/2 top-0 aspect-square w-[130%]">
        <canvas
          className="size-full opacity-0 transition-opacity duration-500"
          style={{ contain: 'layout paint size' }}
          ref={canvasRef}
          onPointerDown={(e) => {
            pointerRef.current = e.clientX
            canvasRef.current!.style.cursor = 'grabbing'
          }}
          onPointerUp={() => {
            pointerRef.current = null
            canvasRef.current!.style.cursor = 'grab'
          }}
          onPointerOut={() => {
            pointerRef.current = null
            if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
          }}
          onMouseMove={(e) => {
            if (pointerRef.current !== null) {
              const delta = e.clientX - pointerRef.current
              dragRef.current += delta / 800
              pointerRef.current = e.clientX
            }
          }}
          onTouchMove={(e) => {
            if (pointerRef.current !== null && e.touches[0]) {
              const delta = e.touches[0].clientX - pointerRef.current
              dragRef.current += delta / 800
              pointerRef.current = e.touches[0].clientX
            }
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 h-full bg-[radial-gradient(circle_at_50%_200%,rgba(0,0,0,0.2),rgba(255,255,255,0))]" />
    </div>
  )
}
