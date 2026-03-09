'use client'

import { useEffect, useRef, useMemo } from 'react'
import createGlobe, { type COBEOptions } from 'cobe'
import { useMotionValue, useSpring } from 'framer-motion'
import { useTheme } from '@ciphera-net/ui'
import { countryCentroids } from '@/lib/country-centroids'

const MOVEMENT_DAMPING = 3000

interface GlobeProps {
  data: Array<{ country: string; pageviews: number }>
  className?: string
}

export default function Globe({ data, className }: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phiRef = useRef(0)
  const pointerInteracting = useRef<number | null>(null)
  const pointerInteractionMovement = useRef(0)
  const { resolvedTheme } = useTheme()

  const isDark = resolvedTheme === 'dark'

  const markers = useMemo(() => {
    if (!data.length) return []
    const max = Math.max(...data.map((d) => d.pageviews))
    if (max === 0) return []

    return data
      .filter((d) => d.country && d.country !== 'Unknown' && countryCentroids[d.country])
      .map((d) => ({
        location: [countryCentroids[d.country].lat, countryCentroids[d.country].lng] as [number, number],
        size: 0.03 + (d.pageviews / max) * 0.12,
      }))
  }, [data])

  const r = useMotionValue(0)
  const rs = useSpring(r, {
    mass: 1,
    damping: 60,
    stiffness: 60,
  })

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value
    if (canvasRef.current) {
      canvasRef.current.style.cursor = value !== null ? 'grabbing' : 'grab'
    }
  }

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current
      pointerInteractionMovement.current = delta
      r.set(r.get() + delta / MOVEMENT_DAMPING)
    }
  }

  useEffect(() => {
    if (!canvasRef.current) return

    const size = canvasRef.current.offsetWidth
    const pixelRatio = Math.min(window.devicePixelRatio, 2)

    const globe = createGlobe(canvasRef.current, {
      width: size * pixelRatio,
      height: size * pixelRatio,
      devicePixelRatio: pixelRatio,
      phi: 0,
      theta: 0.3,
      dark: isDark ? 1 : 0,
      diffuse: isDark ? 2 : 0.4,
      mapSamples: 16000,
      mapBrightness: isDark ? 2 : 1.2,
      baseColor: isDark ? [0.5, 0.5, 0.5] : [1, 1, 1],
      markerColor: [253 / 255, 94 / 255, 15 / 255],
      glowColor: isDark ? [0.15, 0.15, 0.15] : [1, 1, 1],
      markers,
      onRender: (state) => {
        if (!pointerInteracting.current) phiRef.current += 0.002
        state.phi = phiRef.current + rs.get()
      },
    } as COBEOptions)

    setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '1'
    }, 0)

    return () => {
      globe.destroy()
    }
  }, [rs, markers, isDark])

  return (
    <div className={`relative w-full h-full overflow-hidden ${className ?? ''}`}>
      <div className="absolute left-1/2 -translate-x-1/2 top-0 aspect-square w-[130%]">
        <canvas
          className="size-full opacity-0 transition-opacity duration-500"
          style={{ contain: 'layout paint size' }}
          ref={canvasRef}
          onPointerDown={(e) => {
            pointerInteracting.current = e.clientX
            updatePointerInteraction(e.clientX)
          }}
          onPointerUp={() => updatePointerInteraction(null)}
          onPointerOut={() => updatePointerInteraction(null)}
          onMouseMove={(e) => updateMovement(e.clientX)}
          onTouchMove={(e) =>
            e.touches[0] && updateMovement(e.touches[0].clientX)
          }
        />
      </div>
      <div className="pointer-events-none absolute inset-0 h-full bg-[radial-gradient(circle_at_50%_200%,rgba(0,0,0,0.2),rgba(255,255,255,0))]" />
    </div>
  )
}
