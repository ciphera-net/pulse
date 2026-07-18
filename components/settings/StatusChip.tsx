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

// Alpha-wash recipe (spec §2.3): `bg-{tone}/10` + toned text, no border. Danger
// and brand route through the semantic `destructive` / `primary` tokens. Neutral
// is deliberately a touch stronger than a 10% wash so it stays legible on the
// #0f0f0f card surface.
const TONES: Record<ChipTone, string> = {
  neutral: 'bg-white/[0.06] text-neutral-300',
  success: 'bg-emerald-500/10 text-emerald-400',
  info: 'bg-blue-500/10 text-blue-400',
  warning: 'bg-amber-500/10 text-amber-400',
  danger: 'bg-destructive/10 text-destructive',
  brand: 'bg-primary/10 text-primary',
  purple: 'bg-purple-500/10 text-purple-400',
}

const DOT_COLOR: Record<ChipTone, string> = {
  neutral: 'bg-neutral-400',
  success: 'bg-emerald-400',
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  danger: 'bg-destructive',
  brand: 'bg-primary',
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
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none text-xs font-medium whitespace-nowrap',
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
