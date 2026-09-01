'use client'

import { useState } from 'react'
import { ArrowLineDown } from '@phosphor-icons/react'
import { formatNumber } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ScrollDepthDistribution } from '@/lib/api/stats'
import type { PagePreview } from '@/lib/api/performance'

// ---------------------------------------------------------------------------
// Scroll depth, two renderings (owner pick "D6h2", 19-08-2026):
//
// With a full-page capture (the Performance instrument's newest ok check),
// the card draws the READER'S OWN PAGE as four stacked sheets — the top of
// each quarter, each sheet dimmer as readers leave — with the numbers in the
// card chrome: shares and counts above each sheet, depth captions below.
// Text never sits on the imagery.
//
// Without a capture (Performance disabled, or no check yet), the card falls
// back to the sibling cards' row grammar. Absence is a state, not an error.
// ---------------------------------------------------------------------------

const THRESHOLDS = [25, 50, 75, 100] as const
const LIMIT = 7 // sibling cards render 7 row slots; the fallback pads to match

// Sheet geometry: the first sheet is fully visible at SHEET_W wide; each
// deeper sheet peeks out by an equal strip. clamp keeps it usable on mobile.
const SHEET_W = 'clamp(160px, 46%, 300px)'
const SHEET_H = 170

// The dim over each sheet encodes attrition: derived from the share still
// reading, never a hand-tuned constant per row.
function dimFor(share: number): number {
  return Math.min(0.78, Math.max(0.04, (1 - share) * 0.85))
}

const CAPTIONS = ['to 25%', 'to 50%', 'to 75%', 'to the end']

export default function ScrollDepthBars({ scrollDepth, preview, bare = false }: {
  scrollDepth?: ScrollDepthDistribution
  // The newest full-page capture; null/undefined = render the rails fallback.
  preview?: PagePreview | null
  // Render only the content, no card chrome/header — for composition inside
  // the Content section's tabbed card (Scroll depth · Events).
  bare?: boolean
}) {
  const total = scrollDepth?.total_sessions ?? 0
  const hasData = total > 0
  const maxCount = scrollDepth?.scroll_25 ?? 0

  // Which sheet the pointer is over (layered render only). Hover is an
  // enhancement — every number is always visible without it.
  const [hovered, setHovered] = useState<number | null>(null)

  const counts = THRESHOLDS.map(t =>
    (scrollDepth?.[`scroll_${t}` as keyof ScrollDepthDistribution] as number) ?? 0)
  const shares = counts.map(n => (total > 0 ? n / total : 0))

  const annotationGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${SHEET_W} repeat(3, 1fr)`,
    alignItems: 'baseline',
  }

  // A function, not a const: JSX in a const evaluates eagerly, and this
  // branch dereferences the capture that the fallback path does not have.
  const renderLayered = (shot: string) => (
    <div className="w-full">
      <p className="mb-2.5 text-[11px] tracking-[.02em] text-neutral-500">
        How far down the page readers got — each sheet dimmer as they leave
      </p>
      <div style={annotationGrid} className="mb-2">
        {shares.map((share, i) => (
          <span key={THRESHOLDS[i]} className="flex items-baseline justify-center gap-1.5">
            <span className="text-[13.5px] font-semibold tabular-nums text-white">{Math.round(share * 100)}%</span>
            <span className={`text-[11px] tabular-nums transition-colors duration-base ease-apple ${hovered === i ? 'text-white' : 'text-neutral-500'}`}>
              {formatNumber(counts[i])}
            </span>
          </span>
        ))}
      </div>
      <div className="relative w-full" style={{ height: SHEET_H }}>
        {THRESHOLDS.map((t, i) => (
          <div
            key={t}
            className="absolute top-0 overflow-hidden border border-neutral-800"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: SHEET_W,
              height: SHEET_H,
              left: `calc(${i} * (100% - ${SHEET_W}) / 3)`,
              // The hovered sheet rises above all four; at rest, shallower
              // sheets stack over deeper ones.
              zIndex: hovered === i ? 10 : 4 - i,
              transform: hovered === i ? 'scale(1.06)' : 'scale(1)',
              // Grow away from the container edge so the end sheets never
              // clip against the card.
              transformOrigin: i === 0 ? 'left center' : i === 3 ? 'right center' : 'center',
              transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 220ms cubic-bezier(0.32, 0.72, 0, 1)',
              boxShadow: hovered === i
                ? '0 6px 28px rgba(0,0,0,.65)'
                : i > 0 ? '-14px 0 22px rgba(0,0,0,.55)' : undefined,
            }}
          >
            {/* The top of quarter i: the capture scaled to sheet width and
                shifted up by i quarters of ITS OWN height — translateY in %
                is relative to the image, which makes the crop exact without
                knowing the capture's pixel dimensions. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot}
              alt=""
              className="block w-full"
              style={{ transform: `translateY(-${i * 25}%)` }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                // On hover the dim falls to its floor so the reader can see
                // that band of their page; at rest it encodes attrition.
                background: `rgba(10,10,10,${(hovered === i ? 0.04 : dimFor(shares[i])).toFixed(2)})`,
                transition: 'background 220ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
      <div style={annotationGrid} className="mt-2">
        {CAPTIONS.map(cap => (
          <span key={cap} className="text-center text-[10.5px] text-neutral-600">{cap}</span>
        ))}
      </div>
    </div>
  )

  const rails = (
    <div className="flex-1 space-y-2">
      {THRESHOLDS.map((threshold, i) => {
        const count = counts[i]
        const share = shares[i] * 100
        const barWidth = maxCount > 0 ? (count / maxCount) * 75 : 0
        return (
          <div
            key={threshold}
            className="interactive-row relative overflow-hidden flex items-center justify-between h-9 rounded-none px-2 -mx-2"
          >
            <div
              className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.16] md:group-hover:bg-brand-orange/[0.26] rounded-none transition-[width,background-color] ease-apple"
              style={{ width: `${barWidth}%` }}
              aria-hidden="true"
            />
            <div className="relative flex-1 truncate text-white flex items-center">
              <span className="truncate">Reached {threshold}%</span>
            </div>
            <div className="relative flex items-center gap-2 ml-4">
              <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                {Math.round(share)}%
              </span>
              <span className="text-sm font-semibold text-neutral-400">
                {formatNumber(count)}
              </span>
            </div>
          </div>
        )
      })}
      {Array.from({ length: LIMIT - THRESHOLDS.length }).map((_, i) => (
        <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
      ))}
      {/* In bare mode the wrapping card's header states the session count. */}
      {!bare && (
        <p className="mt-3 text-xs text-neutral-500">
          {formatNumber(total)} {total === 1 ? 'visit' : 'visits'}
        </p>
      )}
    </div>
  )

  const content = (
    <>
      {hasData ? (
        preview?.screenshot ? renderLayered(preview.screenshot) : rails
      ) : (
        <EmptyState
          icon={<ArrowLineDown />}
          title="No scrolls recorded yet"
          description="Scroll tracking is automatic — depth data appears once visitors start reading your pages."
          action={{ label: 'Install tracking script', href: '/installation' }}
        />
      )}
    </>
  )

  if (bare) return content

  return (
    <div className="flex h-full flex-col rounded-none border border-border bg-card p-4">
      <div className="mb-3">
        <span className="text-xs text-neutral-500">Scroll depth</span>
      </div>
      {content}
    </div>
  )
}
