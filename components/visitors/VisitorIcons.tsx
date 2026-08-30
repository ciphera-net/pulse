'use client'

import { useState, type ReactNode } from 'react'
import {
  getBrowserIcon,
  getOSIcon,
  getDeviceIcon,
  getReferrerIcon,
  getReferrerFavicon,
  getReferrerDisplayName,
} from '@/lib/utils/icons'
import { cn } from '@/lib/utils'

// ─── The Visitors icon kit ──────────────────────────────────────────
//
// 🔴 THIS FILE IS A SIZING ADAPTER. IT OWNS NO ARTWORK.
//
// It used to. The first version resolved browsers and operating systems through
// `/api/favicon?domain=…` — which returns each VENDOR'S OWN WEBSITE FAVICON.
// Those are not an icon set: microsoft.com's is a four-colour square,
// kernel.org's is a rectangle, apple.com's is an apple. They arrived at
// different aspect ratios and different visual weights, and none of them were
// the icons the Dashboard shows for the same browser on the same site.
//
// Pulse has had one browser/OS/device/referrer icon registry the whole time —
// `lib/utils/icons.tsx`, backed by a curated square set on our own CDN
// (`/icons/browsers/*.svg`, `/icons/os/*.png`, with `invert` on macOS so it
// reads on dark) and used by the dashboard's TechSpecs, TopReferrers, Campaigns
// and the filter popover. Building a second one was the "reuse the dominant
// device, don't invent a novel one" rule broken in the most literal way
// available.
//
// So: every mark below is the registry's, unchanged. The only thing this file
// adds is a box, because the roster's meta line is 12px text and the registry
// hard-codes 20px on the <img>. Same artwork, same file, same CDN — one size
// down for a denser line.

/**
 * Box a registry icon at the meta line's scale.
 *
 * The `[&_img]` / `[&_svg]` descendants are what actually resize it: the
 * registry sets width/height ATTRIBUTES on its <img>, which a parent's size
 * cannot override on its own.
 */
function MetaIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center [&_img]:size-4 [&_svg]:size-4',
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

export function BrowserMark({ browser, className }: { browser?: string | null; className?: string }) {
  if (!browser) return null
  return <MetaIcon className={className}>{getBrowserIcon(browser)}</MetaIcon>
}

export function OSMark({ os, className }: { os?: string | null; className?: string }) {
  if (!os) return null
  return <MetaIcon className={className}>{getOSIcon(os)}</MetaIcon>
}

/**
 * ReferrerMark — SIGIL FIRST, curated registry icon second.
 *
 * This is TopReferrers' `renderReferrerIcon`, verbatim in structure and sized
 * for the meta line. The order matters and is not an implementation detail:
 *
 *   1. `getReferrerFavicon` returns a **Sigil** URL (`/api/favicon?domain=…`,
 *      resolved server-side by icons.ciphera.net) for any domain we have no
 *      curated artwork for. Sigil is how this product resolves a favicon —
 *      never a third-party service, never a guess.
 *   2. It returns null for a domain the registry DOES have art for (Google,
 *      GitHub, LinkedIn…), and for those `getReferrerIcon` draws the house
 *      brand icon — the same one the Dashboard draws.
 *
 * A failed Sigil fetch falls back to the registry rather than leaving a hole.
 */
export function ReferrerMark({ referrer, className }: { referrer?: string | null; className?: string }) {
  const [faviconFailed, setFaviconFailed] = useState(false)
  if (!referrer) return null

  const faviconUrl = getReferrerFavicon(referrer)
  if (faviconUrl && !faviconFailed) {
    return (
      <MetaIcon className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0 rounded-none object-contain"
          onError={() => setFaviconFailed(true)}
        />
      </MetaIcon>
    )
  }
  return <MetaIcon className={className}>{getReferrerIcon(referrer)}</MetaIcon>
}

export function DeviceGlyph({ device, className }: { device?: string | null; className?: string }) {
  if (!device) return null
  return <MetaIcon className={cn('text-neutral-400', className)}>{getDeviceIcon(device)}</MetaIcon>
}

/**
 * referrerLabel is the registry's display name, with "Direct" for the absence.
 *
 * The registry already knows that `news.ycombinator.com` is "Hacker News" — the
 * first version of this file carried its own little lookup table beside it,
 * which is the same duplication as the icons, one layer down.
 */
export function referrerLabel(referrer?: string | null): string {
  if (!referrer) return 'Direct'
  return getReferrerDisplayName(referrer) || 'Direct'
}
