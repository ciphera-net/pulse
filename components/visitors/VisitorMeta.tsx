'use client'

import { CountryFlag } from '@/components/ui/CountryFlag'
import {
  BrowserMark,
  OSMark,
  ReferrerMark,
  DeviceGlyph,
  referrerLabel,
  browserVendor,
  osVendor,
} from './VisitorIcons'
import { countryName } from '@/lib/visitors/format'

// ─── The roster / header meta line (approved §9a.4 line 2) ──────────
//
// flag + country · browser icon + name · OS icon + name · device glyph ·
// "via" + referrer favicon + name.
//
// 🔑 EVERY SEGMENT IS OMITTED WHEN ITS VALUE IS NULL, and null here means the
// site's own collection settings do not collect it (D7). It is never replaced by
// "Unknown" — the row would then assert something about the visitor that the
// site deliberately chose not to learn. The em dash appears in the Profile GRID,
// where a labelled cell needs a value; a meta line has no labels, so absence is
// simply absence.

interface VisitorMetaProps {
  country?: string | null
  city?: string | null
  browser?: string | null
  os?: string | null
  deviceType?: string | null
  referrer?: string | null
  /**
   * Whether this site collects referrers at all.
   *
   * 🔴 It is the DISCRIMINATOR, and without it the line cannot be honest.
   * `referrer: null` means two different things on the wire — "your site does
   * not collect this" and "this visit arrived directly" — because a direct
   * visit's referrer column is genuinely NULL. Rendering "via Direct" for both
   * would tell a site that collects no referrers that every one of its readers
   * came direct, which is a fabrication; omitting the segment for both would
   * hide a real, collected fact. The site's own setting separates them.
   */
  collectsReferrers?: boolean
  className?: string
}

function Dot() {
  return (
    <span className="text-neutral-700" aria-hidden="true">
      ·
    </span>
  )
}

export function VisitorMeta({
  country,
  city,
  browser,
  os,
  deviceType,
  referrer,
  collectsReferrers = false,
  className,
}: VisitorMetaProps) {
  const segments: React.ReactNode[] = []

  if (country) {
    segments.push(
      <span key="geo" className="flex items-center gap-1.5">
        <CountryFlag code={country} className="h-3 w-[18px] shrink-0 rounded-none" />
        <span>{city ? `${city}, ${countryName(country)}` : countryName(country)}</span>
      </span>,
    )
  }
  // 🔑 FOLD WHEN BROWSER AND OS SHARE A VENDOR (approved design §9a.4).
  //
  // Safari and macOS both resolve to apple.com; Edge and Windows both to
  // microsoft.com. Rendering both marks prints the SAME favicon twice in a row,
  // which reads as a rendering bug rather than as information. The approved mock
  // shows `[Apple] Safari · macOS` — one mark, the OS as bare text — while
  // keeping two where the vendors genuinely differ (`[Chrome] Chrome ·
  // [Windows] Windows`).
  const folded = Boolean(browser && os && browserVendor(browser) === osVendor(os))

  if (browser) {
    segments.push(
      <span key="browser" className="flex items-center gap-1.5">
        <BrowserMark browser={browser} />
        <span>{folded ? `${browser} · ${os}` : browser}</span>
      </span>,
    )
  }
  // `folded` is false whenever there is no browser, so this one branch also
  // covers an OS standing on its own — it keeps its own mark.
  if (os && !folded) {
    segments.push(
      <span key="os" className="flex items-center gap-1.5">
        <OSMark os={os} />
        <span>{os}</span>
      </span>,
    )
  }
  if (deviceType) {
    segments.push(
      <span key="device" className="flex items-center">
        <DeviceGlyph device={deviceType} />
      </span>,
    )
  }
  // Renders whenever referrers are collected, INCLUDING for a null one —
  // "via Direct" is information, not an absence.
  if (referrer || collectsReferrers) {
    segments.push(
      <span key="ref" className="flex items-center gap-1.5">
        <span className="text-neutral-600">via</span>
        <ReferrerMark referrer={referrer} />
        <span>{referrerLabel(referrer)}</span>
      </span>,
    )
  }

  if (segments.length === 0) return null

  return (
    <div className={'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400 ' + (className ?? '')}>
      {segments.map((s, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <Dot />}
          {s}
        </span>
      ))}
    </div>
  )
}
