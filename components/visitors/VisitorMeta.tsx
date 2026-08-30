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
    segments.push(
      <span key="device" className="flex items-center">
        <DeviceGlyph device={deviceType} />
      </span>,
    )
  }
  // The referrer segment always renders when referrers are collected at all —
  // "via Direct" is information, not an absence.
  if (referrer !== null && referrer !== undefined) {
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
