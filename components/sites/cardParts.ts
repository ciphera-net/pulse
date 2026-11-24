'use client'

// The parts both site cards share (moved out of FleetCard.tsx on 24-11-2026 when the new card arrived behind the
// new-sites beta; FleetCard leaves with the beta, these stay): a card asks for its picture only near the viewport, a
// card with no picture takes its favicon's colour, the light test of the picture under the text, and the settings
// link that names the site first.
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'

/** Bottom-third mean luminance above this ⇒ light capture ⇒ stronger scrim. */
export const LIGHT_CAPTURE_LUMINANCE = 0.55

/** Lazy-fetch gate: captures are 150–400KB each, so a card only requests its
 * preview once it approaches the viewport. */
export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, inView]
}

/**
 * Dominant favicon color (as an "r g b" triplet) for the no-capture fallback
 * plate. Purely cosmetic: any failure (no favicon, canvas quirk) resolves to
 * null and the plate stays neutral — never a user-visible error.
 */
export function useFaviconTint(domain: string, enabled: boolean): string | null {
  const [tint, setTint] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    let cancelled = false
    const img = document.createElement('img')
    img.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 16
        canvas.height = 16
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, 16, 16)
        const data = ctx.getImageData(0, 0, 16, 16).data
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 32) continue
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n++
        }
        if (n > 0) setTint(`${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)}`)
      } catch {
        /* cosmetic only */
      }
    }
    img.src = `${FAVICON_SERVICE_URL}?domain=${encodeURIComponent(domain)}&sz=64`
    return () => {
      cancelled = true
    }
  }, [domain, enabled])
  return tint
}

/**
 * Mean luminance (0..1) of the band the scrim text actually sits on — the
 * bottom third of the DISPLAYED slice of the capture, in source coordinates.
 * Captures are full-page tall, so sampling the source's own bottom would read
 * the site's footer, not the region under the identity row. Returns null when
 * unreadable (jsdom, zero-size frame) — cosmetic only, default scrim holds.
 */
export function sampleDisplayedBandLuminance(img: HTMLImageElement): number | null {
  try {
    const frame = img.parentElement?.getBoundingClientRect()
    if (!frame || frame.width <= 0 || frame.height <= 0 || img.naturalWidth <= 0) return null
    const scale = img.naturalWidth / frame.width
    const displayedSrcH = frame.height * scale
    const bandTop = Math.min((displayedSrcH * 2) / 3, Math.max(0, img.naturalHeight - 1))
    const bandH = Math.max(1, Math.min(displayedSrcH / 3, img.naturalHeight - bandTop))
    const w = 48
    const h = 16
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, bandTop, img.naturalWidth, bandH, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    }
    return sum / (data.length / 4) / 255
  } catch {
    return null
  }
}

export function activeSiteHref(siteId: string) {
  return {
    href: '/settings/site/general',
    onClick: (e: MouseEvent) => {
      e.stopPropagation()
      sessionStorage.setItem('pulse_active_site', siteId)
    },
  }
}
