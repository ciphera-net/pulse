'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * StatusChip — the single house status-pill for settings surfaces.
 *
 * Consolidates the four-plus hand-rolled chip recipes that had drifted across
 * the settings tabs (`bg-{c}-900/30`+`text-micro-label`, `bg-{c}-500/20`+
 * `text-[10px]`, dot+border+`text-xs`, plain `text-{c}-400` icon-only) into one
 * shape that matches the freshest on-system surface, WorkspaceBillingTab's
 * status pills (`px-2 py-0.5 text-xs font-medium rounded-none
 * bg-{c}-900/30 text-{c}-400 border border-{c}-900/50`).
 *
 * Off-system greens (`bg-green-950/40`, `bg-green-500/5`, raw `text-green-400`
 * inline) collapse into `tone="success"` here so "active / connected / this
 * device / paid" all read identically to billing's "Active" chip.
 */
export type ChipTone =
  | 'neutral'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'brand'
  | 'purple'

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  success: 'bg-green-900/30 text-green-400 border-green-900/50',
  info: 'bg-blue-900/30 text-blue-400 border-blue-900/50',
  warning: 'bg-amber-900/30 text-amber-400 border-amber-900/50',
  danger: 'bg-red-900/30 text-red-400 border-red-900/50',
  brand: 'bg-brand-orange/10 text-brand-orange border-brand-orange/30',
  purple: 'bg-purple-900/30 text-purple-400 border-purple-900/50',
}

const DOT_COLOR: Record<ChipTone, string> = {
  neutral: 'bg-neutral-500',
  success: 'bg-green-400',
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  brand: 'bg-brand-orange',
  purple: 'bg-purple-400',
}

interface StatusChipProps {
  tone?: ChipTone
  /** Leading status dot; `pulse` animates it (use sparingly, e.g. a live link). */
  dot?: boolean
  pulse?: boolean
  /** Optional leading icon (Phosphor node); mutually complementary with `dot`. */
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function StatusChip({ tone = 'neutral', dot, pulse, icon, className, children }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none border text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_COLOR[tone], pulse && 'animate-pulse')} />
      )}
      {icon}
      {children}
    </span>
  )
}
