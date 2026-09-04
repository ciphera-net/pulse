'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import Link from 'next/link'
import { SettingsIcon } from '@ciphera-net/facet'
import type { Site, SiteOverview } from '@/lib/api/sites'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { FleetSparkline } from '@/components/sites/FleetSparkline'
import { usePagePreview } from '@/lib/swr/dashboard'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import { formatNumber } from '@/lib/utils/format'
import { useCan } from '@/lib/auth/permissions'
import { displayDomain } from '@/lib/utils/displayDomain'

/** Bottom-third mean luminance above this ⇒ light capture ⇒ stronger scrim. */
const LIGHT_CAPTURE_LUMINANCE = 0.55

/** Lazy-fetch gate: captures are 150–400KB each, so a card only requests its
 * preview once it approaches the viewport. */
function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
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
function useFaviconTint(domain: string, enabled: boolean): string | null {
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
function sampleDisplayedBandLuminance(img: HTMLImageElement): number | null {
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

function activeSiteHref(siteId: string) {
  return {
    href: '/settings/site/general',
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      sessionStorage.setItem('pulse_active_site', siteId)
    },
  }
}

export interface FleetCardProps {
  site: Site
  /** null while the overview request is in flight (skeleton slot). */
  overview: SiteOverview | null
  /** A failed overview fetch renders as a visible error — never as 0 or "—". */
  overviewError: boolean
}

/**
 * The V2d4 "cinematic" fleet card: full-bleed daily CDP capture, bottom scrim,
 * identity row + one number (visitors today, site timezone) on the scrim, and
 * a 7-day ghost sparkline. The only overlay chip is an amber status chip when
 * something is wrong — derived from install_status + uptime last_status, NEVER
 * is_verified (the known false green). Realtime is out of scope by decision.
 */
export function FleetCard({ site, overview, overviewError }: FleetCardProps) {
  const [cardRef, inView] = useInView<HTMLDivElement>()
  const { data: preview } = usePagePreview(inView ? site.id : '')
  const [strongScrim, setStrongScrim] = useState(false)
  const canEditSite = useCan('sites.edit')

  const installStatus = overview?.install_status ?? null
  const stalled = installStatus === 'stalled'
  const neverInstalled = installStatus === 'never_installed'
  const uptime = overview?.uptime_status ?? null

  // * Precedence down > degraded > stalled; healthy/unknown/no-monitor = no chip.
  const chip = uptime === 'down' ? 'down' : uptime === 'degraded' ? 'degraded' : stalled ? 'stalled' : null

  const stalledDays = (() => {
    if (!stalled || !overview?.last_event_at) return null
    const ms = Date.now() - Date.parse(overview.last_event_at)
    return Math.max(1, Math.floor(ms / 86_400_000))
  })()

  const tint = useFaviconTint(site.domain, inView && preview === null)
  const settingsProps = activeSiteHref(site.id)

  return (
    <div
      ref={cardRef}
      className="group relative h-[290px] overflow-hidden rounded-none border border-neutral-800 bg-neutral-900 transition-colors duration-base ease-apple hover:border-neutral-700"
    >
      {/* Background: capture, or a favicon-tinted plate when none exists.
          The capture starts at the VERY TOP of the page — the site's own
          header is part of the card's identity (owner decision 22-08,
          superseding the earlier crop-below-navbar idea). Full-bleed cover,
          exactly the mock's geometry. */}
      {preview?.screenshot ? (
        <div className="absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI from the capture store */}
          <img
            src={preview.screenshot}
            alt=""
            onLoad={(e) => {
              const luma = sampleDisplayedBandLuminance(e.currentTarget)
              if (luma !== null && luma > LIGHT_CAPTURE_LUMINANCE) setStrongScrim(true)
            }}
            className={`absolute inset-0 h-full w-full object-cover object-top ${
              stalled || neverInstalled ? 'grayscale-[.55] brightness-[.65]' : 'brightness-[.92]'
            }`}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={
            tint
              ? { background: `linear-gradient(180deg, rgba(${tint.split(' ').join(',')},0.14), rgba(${tint.split(' ').join(',')},0.04))` }
              : undefined
          }
        />
      )}

      {/* Scrim — stronger when the capture's lower band measured light */}
      <div
        className={`absolute inset-0 ${
          strongScrim
            ? 'bg-[linear-gradient(180deg,rgba(10,10,10,0.45)_0%,rgba(10,10,10,0.25)_35%,rgba(10,10,10,0.94)_100%)]'
            : 'bg-[linear-gradient(180deg,rgba(10,10,10,0.1)_0%,rgba(10,10,10,0.02)_35%,rgba(10,10,10,0.92)_100%)]'
        }`}
      />

      {/* Amber status chip — ONLY when unhealthy */}
      {chip && (
        <span className="absolute left-3 top-3 z-[5] inline-flex items-center gap-1.5 rounded-none border border-amber-500/40 bg-black/85 px-2 py-1 text-[11px] font-medium text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {chip}
        </span>
      )}

      {/* 7-day ghost sparkline riding the scrim */}
      {overview && !neverInstalled && <FleetSparkline days={overview.daily} dim={stalled} />}

      {/* Never-installed: this card IS the setup state (the old docs card's job) */}
      {neverInstalled && (
        <div className="absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-6 text-center pointer-events-none">
          <p className="text-sm font-semibold text-neutral-100">Waiting for the first event</p>
          <p className="mx-auto mt-1 max-w-[34ch] text-xs text-neutral-400">
            Install the tracking script to start collecting privacy-friendly analytics.
          </p>
          <div className="pointer-events-auto relative mt-3 flex items-center justify-center gap-4 text-xs font-medium">
            {canEditSite && (
              <Link {...settingsProps} className="text-brand-orange hover:underline">
                Set up →
              </Link>
            )}
            <Link
              href="https://help.ciphera.net/docs/pulse"
              target="_blank"
              onClick={(e) => e.stopPropagation()}
              className="text-neutral-300 hover:text-white hover:underline"
            >
              Read the docs
            </Link>
          </div>
        </div>
      )}

      {/* Bottom stack: stalled notice + identity row. pointer-events pass
          through to the overlay link except on the real links. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        {stalled && (
          <div className="px-4 pb-1.5 text-xs font-medium text-amber-400">
            No events for {stalledDays ?? '14+'} days —{' '}
            <Link {...settingsProps} className="pointer-events-auto underline underline-offset-2 hover:text-amber-300">
              check the install →
            </Link>
          </div>
        )}
        <div className="flex items-end gap-3 p-4 pt-1">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center border border-neutral-800 bg-neutral-800/90">
            <SiteFavicon domain={site.domain} name={site.name} size={18} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-neutral-50">{site.name}</div>
            <div className="truncate text-xs text-neutral-400">{displayDomain(site)}</div>
          </div>
          {!neverInstalled && (
            <div className="ml-auto text-right">
              {overviewError ? (
                <div className="text-sm font-medium leading-tight text-red-400">couldn&apos;t load</div>
              ) : overview ? (
                <div
                  className={`text-[21px] font-bold leading-tight tabular-nums ${
                    stalled ? 'text-neutral-500' : 'text-neutral-50'
                  }`}
                >
                  {formatNumber(overview.visitors_today)}
                </div>
              ) : (
                <div className="ml-auto h-6 w-12 animate-skeleton-fade bg-neutral-800" />
              )}
              <div className="text-[11px] text-neutral-400">visitors today</div>
            </div>
          )}
        </div>
      </div>

      {/* Whole card links to the site dashboard */}
      <Link
        href={`/sites/${site.id}`}
        aria-label={`${site.name} dashboard`}
        className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
      />

      {/* Settings gear — hover/focus only, permission-gated */}
      {canEditSite && (
        <Link
          {...settingsProps}
          title="Site Settings"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-none border border-neutral-700 bg-black/70 text-neutral-300 opacity-0 transition-opacity duration-fast ease-apple hover:bg-neutral-800 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange group-hover:opacity-100"
        >
          <SettingsIcon className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}
