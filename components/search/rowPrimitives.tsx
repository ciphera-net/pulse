'use client'

import * as React from 'react'
import { Monitor, DeviceMobile, DeviceTablet } from '@phosphor-icons/react'
import * as Flags from 'country-flag-icons/react/3x2'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import { alpha3ToAlpha2 } from '@/lib/utils/countryCodes'
import { SkeletonLine } from '@/components/skeletons'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { PositionBadge } from './PositionBadge'

// ---------------------------------------------------------------------------
// The one row grammar for the Search Console views. A card, mono sentence-case
// column headers, h-9 rows with a proportional orange bar behind the label and
// a fixed-width tabular metric block on the right (Clicks / Impressions / CTR /
// Position) that headers and rows share so columns always line up. Impressions
// and CTR fold away below sm to keep the label legible on narrow screens.
// ---------------------------------------------------------------------------

// Shared column widths — identical class strings in the header and every row.
const W = {
  clicks: 'w-14 sm:w-20',
  impressions: 'sm:w-24',
  ctr: 'sm:w-16',
  position: 'w-14',
} as const

export const formatCTR = (ctr: number) => `${(ctr * 100).toFixed(1)}%`

// Protocol + trailing slash stripped for a cleaner page URL; full URL goes in title.
export const stripProtocol = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

// Compact thousands (1.2K / 3.4M) for the opportunities upside figure.
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
export const formatCompact = (n: number) => compact.format(n)

// ─── Bar behind the label ────────────────────────────────────────

export function RowBar({ share }: { share: number }) {
  if (!(share > 0)) return null
  // A <span> (phrasing content) so it's valid inside the row <button>; absolute
  // positioning blockifies it, so width still applies.
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-0.5 left-0 top-0.5 rounded-none bg-brand-orange/10 transition-[width] duration-base ease-apple"
      style={{ width: `${Math.min(1, share) * 100}%` }}
    />
  )
}

// ─── Metric block (Clicks / Impressions / CTR / Position) ────────

interface StandardMetricsProps {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export function StandardMetrics({ clicks, impressions, ctr, position }: StandardMetricsProps) {
  // <span> wrapper (phrasing content) — the expandable rows render this inside a
  // <button>, where a <div> would be invalid.
  return (
    <span className="relative ml-3 flex shrink-0 items-center gap-3 text-sm tabular-nums">
      <span className={cn(W.clicks, 'text-right text-neutral-300')}>{formatNumber(clicks)}</span>
      <span className={cn('hidden sm:inline-block', W.impressions, 'text-right text-neutral-400')}>{formatNumber(impressions)}</span>
      <span className={cn('hidden sm:inline-block', W.ctr, 'text-right text-neutral-400')}>{formatCTR(ctr)}</span>
      <span className={cn(W.position, 'flex justify-end')}><PositionBadge position={position} /></span>
    </span>
  )
}

export function StandardHeader({ label }: { label: string }) {
  return (
    <div className="flex h-8 items-center border-b border-border px-3 font-mono text-xs text-neutral-500">
      <span className="min-w-0 flex-1">{label}</span>
      <div className="ml-3 flex shrink-0 items-center gap-3">
        <span className={cn(W.clicks, 'text-right')}>Clicks</span>
        <span className={cn('hidden sm:inline-block', W.impressions, 'text-right')}>Impressions</span>
        <span className={cn('hidden sm:inline-block', W.ctr, 'text-right')}>CTR</span>
        <span className={cn(W.position, 'text-right')}>Position</span>
      </div>
    </div>
  )
}

// A contributing sub-row inside an expanded panel — same columns, no bar.
export function SubRow({ label, title, clicks, impressions, ctr, position }: { label: string; title?: string } & StandardMetricsProps) {
  return (
    <div className="flex h-8 items-center">
      <span className="min-w-0 flex-1 truncate text-sm text-neutral-300" title={title}>{label}</span>
      <StandardMetrics clicks={clicks} impressions={impressions} ctr={ctr} position={position} />
    </div>
  )
}

// ─── Country flag + device glyph ─────────────────────────────────

export function CountryFlag({ alpha3 }: { alpha3: string }) {
  const a2 = alpha3ToAlpha2(alpha3)
  const Flag = a2 ? (Flags as Record<string, React.ComponentType<{ className?: string }>>)[a2] : undefined
  if (!Flag) return <span className="h-3.5 w-5 shrink-0 rounded-none bg-neutral-800" aria-hidden="true" />
  return <Flag className="w-5 shrink-0 rounded-none" />
}

export function deviceIcon(device: string) {
  switch (device.toUpperCase()) {
    case 'MOBILE': return DeviceMobile
    case 'TABLET': return DeviceTablet
    default: return Monitor
  }
}

// ─── Pagination ──────────────────────────────────────────────────

function PageButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 items-center rounded-none border border-border px-3 text-sm text-neutral-300 transition-colors duration-fast ease-apple hover:border-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
    >
      {label}
    </button>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  if (total <= pageSize) return null
  const from = page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, total)
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
      <span className="font-mono text-xs tabular-nums text-neutral-500">
        {from.toLocaleString()}&ndash;{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <PageButton label="Previous" disabled={page === 0} onClick={() => onPage(page - 1)} />
        <PageButton label="Next" disabled={to >= total} onClick={() => onPage(page + 1)} />
      </div>
    </div>
  )
}

// ─── First-load skeleton rows ────────────────────────────────────

export function ViewSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-9 items-center">
          <SkeletonLine className="h-4 w-1/3" />
          <div className="ml-auto flex items-center gap-3">
            <SkeletonLine className="h-4 w-12" />
            <SkeletonLine className="hidden h-4 w-16 sm:block" />
            <SkeletonLine className="hidden h-4 w-10 sm:block" />
            <SkeletonLine className="h-4 w-10" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Stateful card body (skeleton / error / empty / rows) ────────

// Shared by every view: first-load skeleton (only when isLoading && !data, so
// keepPreviousData never flashes), an explicit ErrorCard + Retry (no fake-empty
// on failure), a settled EmptyState, otherwise the rows and optional footer.
export function ViewBody({
  isLoading,
  hasData,
  error,
  isEmpty,
  emptyNode,
  footer,
  onRetry,
  children,
}: {
  isLoading: boolean
  hasData: boolean
  error: unknown
  isEmpty: boolean
  emptyNode: React.ReactNode
  footer?: React.ReactNode
  onRetry: () => void
  children: React.ReactNode
}) {
  if (isLoading && !hasData) return <ViewSkeleton />
  if (error) {
    return (
      <ErrorCard
        title="Couldn't load this view"
        description="The Search Console request failed for this period. Your data is safe — this is a loading problem."
        onRetry={onRetry}
        className="py-10"
      />
    )
  }
  if (isEmpty) return <>{emptyNode}</>
  return (
    <>
      {children}
      {footer}
    </>
  )
}
