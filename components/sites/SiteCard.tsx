'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SettingsIcon } from '@ciphera-net/facet'
import type { Site, SiteOverview } from '@/lib/api/sites'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { FleetSparkline } from '@/components/sites/FleetSparkline'
import {
  LIGHT_CAPTURE_LUMINANCE,
  activeSiteHref,
  sampleDisplayedBandLuminance,
  useFaviconTint,
  useInView,
} from '@/components/sites/cardParts'
import { RailDelta } from '@/components/funnels/FunnelRail'
import { CompactNumber } from '@/components/ui/compact-number'
import { SkeletonBar } from '@/components/skeletons'
import { usePagePreview } from '@/lib/swr/dashboard'
import { DOCS_ORIGIN } from '@/lib/docs'
import { useCan } from '@/lib/auth/permissions'
import { displayDomain } from '@/lib/utils/displayDomain'
import { pctChange } from '@/lib/utils/pctChange'

/**
 * What a site's card says needs a look, as one word beside an orange dot, or null when all is well (the app's rule:
 * colour lives in a dot or a word, never a panel). Down before Degraded before stalled. A site that never sent an
 * event says so on its own plate instead. `inconclusive` and `unknown` uptime carry no word, as on today's card
 * (the Uptime overhaul has not ruled on one).
 */
export function siteCardState(overview: SiteOverview | null, now: number = Date.now()): string | null {
  if (!overview || overview.install_status === 'never_installed') return null
  if (overview.uptime_status === 'down') return 'Down'
  if (overview.uptime_status === 'degraded') return 'Degraded'
  if (overview.install_status === 'stalled') {
    if (!overview.last_event_at) return 'No recent events'
    const days = Math.max(1, Math.floor((now - Date.parse(overview.last_event_at)) / 86_400_000))
    return `No events for ${days} day${days === 1 ? '' : 's'}`
  }
  return null
}

/**
 * The card's figure (R126, 24-11-2026): visitors over the last 7 site-local days, today included, and the 7 days
 * before them for the change. Both come from the server (GET /sites/overview). A server from before the two fields
 * answers without them: the 7 days are then the sum of `daily` (the same count, since a visitor is identified for one
 * day), and no change is shown rather than a guessed one.
 */
export function sevenDayFigures(overview: SiteOverview): { visitors: number; previous: number | null } {
  return {
    visitors: overview.visitors_7d ?? overview.daily.reduce((n, d) => n + d.visitors, 0),
    previous: overview.visitors_prev_7d ?? null,
  }
}

/** The app's pop-up glass (`.glass-panel`: 0.75 over a 40 px blur, saturate 1.5) on the dark ground's colour. */
const POPUP_GLASS = 'bg-neutral-950/75 backdrop-blur-[40px] backdrop-saturate-150'

export interface SiteCardProps {
  site: Site
  /** null while the overview request is in flight (a skeleton in the figure's place). */
  overview: SiteOverview | null
  /** A failed overview read shows as words, never as 0 or a dash. */
  overviewError: boolean
}

/**
 * A site on the Your Sites page, behind the new-sites beta (24-11-2026, the owner's picks R125 to R127; plan
 * Pulse/docs/plans/23-11-2026-your-sites-page-overhaul-plan.md). Today's picture card with round 1's fixes:
 *
 * - The site's own picture fills the card and runs under the band that holds its name and figure. The band is the
 *   app's glass: the toolbar band's recipe (`.glass-band`: the page colour at 0.6 over a 24 px blur, saturate 1.5,
 *   its own GPU layer), its hairline on top where it meets the picture. It is written out on the dark ground's own
 *   colour (`neutral-950` under `dark-ground`, the dark page colour) instead of the class, because `.glass-band` and
 *   `.glass-panel` fill with the page's THEME colour, and these cards are dark in both themes (the 14-11-2026 pick):
 *   in the light theme the class drew white text on pale glass. Over a light picture the band keeps more of its own
 *   colour, so the grey address and label stay readable (measured: white text on the 0.6 band over white is 5:1, the
 *   grey text 2:1; at 0.86 the grey is 5.5:1).
 * - The 7-day line runs along the picture's foot, above the band, so it never crosses a name or a number.
 * - The figure is visitors over the last 7 days with the change against the 7 before, on the number's line (R127).
 * - A state that needs a look is an orange dot and a word on the app's pop-up glass; a site that never sent an event
 *   says so on a plate of the same glass, clear of its picture's own text.
 * - The gear shows on every touch screen (no hover there), and on hover or focus elsewhere.
 *
 * The band, the plate and the chip sit on the dark picture in both themes, so they carry `dark-ground`.
 */
export function SiteCard({ site, overview, overviewError }: SiteCardProps) {
  const [cardRef, inView] = useInView<HTMLDivElement>()
  const { data: preview } = usePagePreview(inView ? site.id : '')
  const [lightPicture, setLightPicture] = useState(false)
  const canEditSite = useCan('sites.edit')

  const neverInstalled = overview?.install_status === 'never_installed'
  const stalled = overview?.install_status === 'stalled'
  const state = siteCardState(overview)
  const figures = overview && !neverInstalled ? sevenDayFigures(overview) : null
  const tint = useFaviconTint(site.domain, inView && preview === null)
  const settingsProps = activeSiteHref(site.id)

  return (
    <div
      ref={cardRef}
      data-site-card={site.id}
      className="group relative flex h-[290px] flex-col overflow-hidden rounded-none border border-neutral-800 bg-neutral-900 transition-colors duration-base ease-apple hover:border-neutral-700"
    >
      {/* The picture, from the very top of the site (the 22-08 decision), under the whole card; or a plate in the
          favicon's colour when there is none. */}
      {preview?.screenshot ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URI from the capture store
        <img
          src={preview.screenshot}
          alt=""
          onLoad={(e) => {
            const luma = sampleDisplayedBandLuminance(e.currentTarget)
            if (luma !== null && luma > LIGHT_CAPTURE_LUMINANCE) setLightPicture(true)
          }}
          className={`absolute inset-0 h-full w-full object-cover object-top ${
            stalled || neverInstalled ? 'grayscale-[.55] brightness-[.5]' : 'brightness-[.92]'
          }`}
        />
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

      {/* The picture's part of the card: the 7-day line along its foot, the state, the waiting plate. */}
      <div className="relative min-h-0 flex-1">
        {/* The picture's foot darkens toward the band, in the dark ground's page colour (both themes). */}
        <div className="dark-ground absolute inset-0 bg-[linear-gradient(180deg,rgb(var(--neutral-950)/0)_55%,rgb(var(--neutral-950)/0.75)_100%)]" />
        {overview && !neverInstalled && <FleetSparkline days={overview.daily} dim={stalled} />}
        {state && (
          <span className={`dark-ground absolute left-3 top-3 z-[5] inline-flex items-center gap-1.5 rounded-none border border-white/[0.08] px-2 py-1 text-[11px] font-medium text-white ${POPUP_GLASS}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" aria-hidden="true" />
            {state}
          </span>
        )}
        {neverInstalled && (
          <div className="dark-ground pointer-events-none absolute inset-0 z-20 grid place-items-center px-6">
            <div className={`max-w-[300px] border border-white/[0.08] px-5 py-4 text-center ${POPUP_GLASS}`}>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" aria-hidden="true" />
                Waiting for the first event
              </p>
              <p className="mt-1 text-xs text-neutral-400">Add the tracking script to the site and its visitors show here.</p>
              <div className="relative mt-3 flex items-center justify-center gap-4 text-xs font-medium">
                {canEditSite && (
                  <Link {...settingsProps} className="pointer-events-auto text-brand-ink hover:underline">
                    Set it up
                  </Link>
                )}
                <Link
                  href={DOCS_ORIGIN}
                  target="_blank"
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto text-neutral-300 hover:text-white hover:underline"
                >
                  Read the docs
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The band: who the site is, and its figure. Glass over the picture, more of its own colour over a light one. */}
      <div
        data-site-band={lightPicture ? 'light' : 'dark'}
        className={`dark-ground pointer-events-none relative z-20 flex items-center gap-3 border-t border-white/[0.08] px-4 py-3 backdrop-blur-[24px] backdrop-saturate-150 transform-gpu ${
          lightPicture ? 'bg-neutral-950/[0.86]' : 'bg-neutral-950/60'
        }`}
      >
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
              <div className="text-sm font-medium leading-tight text-neutral-300">Couldn&apos;t load</div>
            ) : figures ? (
              <div className="flex items-baseline justify-end gap-2">
                {figures.previous !== null && <RailDelta change={pctChange(figures.visitors, figures.previous)} />}
                <CompactNumber
                  value={figures.visitors}
                  className={`text-[21px] font-bold leading-tight ${stalled ? 'text-neutral-500' : 'text-neutral-50'}`}
                />
              </div>
            ) : (
              <SkeletonBar className="ml-auto h-6 w-12 animate-skeleton-fade bg-neutral-800" />
            )}
            <div className="whitespace-nowrap text-[11px] text-neutral-400">visitors, last 7 days</div>
          </div>
        )}
      </div>

      {/* The whole card opens the site's dashboard. */}
      <Link
        href={`/sites/${site.id}`}
        aria-label={`${site.name} dashboard`}
        className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
      />

      {/* The gear: on every touch screen, and on hover or focus where there is a pointer. */}
      {canEditSite && (
        <Link
          {...settingsProps}
          title="Site settings"
          aria-label={`${site.name} settings`}
          className="dark-ground absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-none border border-neutral-700 bg-black/70 text-neutral-300 opacity-0 transition-opacity duration-fast ease-apple hover:bg-neutral-800 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <SettingsIcon className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}
