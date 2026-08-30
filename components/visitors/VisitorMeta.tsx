'use client'

import { CountryFlag } from '@/components/ui/CountryFlag'
import { BrowserMark, OSMark, ReferrerMark, DeviceGlyph, referrerLabel } from './VisitorIcons'
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

/**
 * 'desktop' -> 'Desktop'. The column stores a lowercase token.
 *
 * Exported so the detail page's "Device · Screen" cell spells it the same way
 * the roster's meta line does — two spellings of the same value on two screens
 * of the same feature is how a product starts to read as several products.
 */
export function deviceLabel(device: string): string {
  return device.charAt(0).toUpperCase() + device.slice(1)
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
  // ⚠️ NO FOLD. An earlier version collapsed "Safari · macOS" to one mark,
  // because the approved mock shows one there — but the mock was rendered with
  // FAVICONS, where Safari and macOS are both apple.com and the second mark was
  // a literal duplicate of the first. Against the house registry they are
  // genuinely different artwork (the Safari compass and the Apple mark), the
  // same two the Dashboard shows, so both belong. The mock's single mark was an
  // artifact of the wrong icon source, not a design decision to preserve.
  if (browser) {
    segments.push(
      <span key="browser" className="flex items-center gap-1.5">
        <BrowserMark browser={browser} />
        <span>{browser}</span>
      </span>,
    )
  }
  if (os) {
    segments.push(
      <span key="os" className="flex items-center gap-1.5">
        <OSMark os={os} />
        <span>{os}</span>
      </span>,
    )
  }
  if (deviceType) {
    // The glyph alone is a rebus. A monitor outline is not obviously "desktop"
    // rather than "screen resolution" or "display", and the two mobile-ish
    // glyphs are a coin toss at 16px — every other segment on this line pairs
    // its mark with a word, and this one now does too.
    segments.push(
      <span key="device" className="flex items-center gap-1.5">
        <DeviceGlyph device={deviceType} />
        <span>{deviceLabel(deviceType)}</span>
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
