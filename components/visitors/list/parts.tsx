'use client'

import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Avatar, visitorAvatarSeed } from '@ciphera-net/facet-avatar'
import { visitorPseudonym } from '@/lib/visitors/pseudonym'
import { BrowserMark, DeviceGlyph, OSMark, ReferrerMark } from '@/components/visitors/VisitorIcons'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { countryName } from '@/lib/visitors/format'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { VisitorRow } from '@/lib/api/visitors'
import { sourceOf } from './day'

// ---------------------------------------------------------------------------
// A row's parts on the new Visitors page (look C, rulings R98 to R113; plan
// Pulse/docs/plans/18-11-2026-visitors-page-overhaul-plan.md), each the Pages page's own grammar: the visitor's avatar
// and pseudonym (today's roster's), the place with its flag, the browser, system and device marks, and the source.
// ---------------------------------------------------------------------------

export const nameOf = (v: Pick<VisitorRow, 'visitor_key'>) => visitorPseudonym(v.visitor_key)

/** The Pages page's row: 36 px, the hover band 8 px past the content on each side. */
export const ROW = 'w-[calc(100%+1rem)] text-left relative flex items-center justify-between h-9 group rounded-none px-2 -mx-2'

/** A visitor's avatar and pseudonym; on the site now, production's own mark: a small orange dot with a soft ring (R111). */
export function VisitorName({ v, size = 24, sub }: { v: Pick<VisitorRow, 'visitor_key' | 'active_now'>; size?: number; sub?: ReactNode }) {
  const big = size >= 32
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar seed={visitorAvatarSeed(v.visitor_key)} size={size} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="block truncate text-sm text-white">{nameOf(v)}</span>
          {v.active_now && (
            <>
              <span
                aria-hidden="true"
                className={cn('shrink-0 rounded-full bg-brand-orange', big ? 'size-2' : 'size-1.5')}
                style={{ boxShadow: `0 0 0 ${big ? 4 : 3}px rgb(255 92 0 / 0.18)` }}
                data-active-now=""
              />
              <span className="sr-only">on the site now</span>
            </>
          )}
        </span>
        {sub && <span className="block truncate text-[11px] text-neutral-500">{sub}</span>}
      </span>
    </span>
  )
}

/**
 * Where a visitor is: the city, its region (left out when it repeats the city) and the country, each once and only
 * when known. The row shows the flag and the most specific part known, and names the whole place on hover.
 */
export const placeChain = (v: Pick<VisitorRow, 'city' | 'region' | 'country'>): string[] => {
  const parts: string[] = []
  if (v.city) parts.push(v.city)
  if (v.region && v.region !== v.city) parts.push(v.region)
  if (v.country) parts.push(countryName(v.country))
  return parts
}
const placeShort = (v: Pick<VisitorRow, 'city' | 'region' | 'country'>) => v.city ?? v.region ?? countryName(v.country)

/** The dashboard's glass hover card, in the top layer over the point it names. */
export function HoverCard({ at, mark, children }: { at: { x: number; y: number }; mark: string; children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full pb-2" style={{ left: at.x, top: at.y }} {...{ [mark]: '' }}>
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
        className="whitespace-nowrap rounded-none glass-panel border border-white/[0.08] px-3 py-2 text-sm font-medium text-white shadow-lg"
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  )
}

export function Place({ v, full = false }: { v: Pick<VisitorRow, 'city' | 'region' | 'country'>; full?: boolean }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const whole = placeChain(v).join(', ') || countryName(v.country)
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-300"
      data-place={whole}
      onMouseEnter={full ? undefined : (e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ x: b.left + Math.min(b.width, 140) / 2, y: b.top }) }}
      onMouseLeave={full ? undefined : () => setTip(null)}
    >
      <CountryFlag code={v.country} className="h-3 w-[18px] shrink-0 rounded-none" />
      {full ? <span className="min-w-0 [overflow-wrap:anywhere]">{whole}</span> : <span className="truncate" data-place-short="">{placeShort(v)}</span>}
      {tip && <HoverCard at={tip} mark="data-place-tip">{whole}</HoverCard>}
    </span>
  )
}

/** Browser, system and device as marks only, each named by the dashboard's hover card (R111). */
export function Marks({ v }: { v: Pick<VisitorRow, 'browser' | 'os' | 'device_type'> }) {
  const [tip, setTip] = useState<{ x: number; y: number; name: string; kind: string } | null>(null)
  const device = v.device_type ? v.device_type.charAt(0).toUpperCase() + v.device_type.slice(1) : null
  const marks: { kind: string; name: string | null; glyph: ReactNode }[] = [
    { kind: 'Browser', name: v.browser, glyph: <BrowserMark browser={v.browser} className="h-4 w-4" /> },
    { kind: 'System', name: v.os, glyph: <OSMark os={v.os} className="h-4 w-4" /> },
    { kind: 'Device', name: device, glyph: <DeviceGlyph device={v.device_type} className="h-4 w-4" /> },
  ]
  return (
    <span className="flex items-center gap-2 text-neutral-400" onMouseLeave={() => setTip(null)}>
      {marks.map((m) => (
        <span
          key={m.kind}
          className="flex"
          data-mark-of={m.kind.toLowerCase()}
          onMouseEnter={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ x: b.left + b.width / 2, y: b.top, name: m.name ?? 'Not known', kind: m.kind }) }}
        >
          {m.glyph}
        </span>
      ))}
      {tip && (
        <HoverCard at={tip} mark="data-mark-tip">
          <div>{tip.name}</div>
          <div className="text-xs font-normal text-neutral-400">{tip.kind}</div>
        </HoverCard>
      )}
    </span>
  )
}

export const Source = ({ referrer }: { referrer: string | null }) => (
  <span className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-300">
    <ReferrerMark referrer={referrer} className="h-4 w-4 shrink-0" />
    <span className="truncate">{sourceOf(referrer)}</span>
  </span>
)
