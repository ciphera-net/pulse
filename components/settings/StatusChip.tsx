'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * StatusChip — the one status chip for settings surfaces.
 *
 * Sharp like everything else in the product (Facet `Badge` geometry,
 * `rounded-none`): a small dot plus a word, with the tone carrying the
 * meaning. Colour lives in the dot and the word, never in a solid fill — the
 * solid green `Paid`, the solid red `Revoked` and the uppercase outline
 * `VERIFIED` that used to sit beside this chip were all the same job answered
 * three more ways (settings overhaul, 16-09-2026, §4.5).
 *
 * The chip is deliberately still: a pulsing dot on an `Active` invite link
 * made one chip on a page move while its twin on the next panel did not. Live
 * states say so in the word (`Receiving data`, `Live`) and in the tooltip.
 */
export type ChipTone =
  | 'neutral'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'brand'
  | 'purple'

// Hairline recipe (round two, owner pick 17-09-2026): no fill, a hairline
// frame, the dot and the word carry the tone through the brightest token —
// success = the Facet green `pos` (#3ECF8E), danger = the coral
// `destructive`/`neg` (#F8836B). The /15 washes this replaced were the one
// place colour still lived in a surface rather than in a dot or a word; the
// hairline is the dashboard's "Live" indicator with a frame. Neutral stays
// quiet (soft grey text) so it never competes with a genuine good/bad state.
const TONES: Record<ChipTone, string> = {
  neutral: 'text-neutral-300',
  success: 'text-pos',
  info: 'text-blue-400',
  warning: 'text-amber-400',
  danger: 'text-destructive',
  brand: 'text-primary',
  purple: 'text-purple-400',
}

const DOT_COLOR: Record<ChipTone, string> = {
  neutral: 'bg-neutral-400',
  success: 'bg-pos',
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  danger: 'bg-destructive',
  brand: 'bg-primary',
  purple: 'bg-purple-400',
}

interface StatusChipProps {
  tone?: ChipTone
  /** Leading status dot. */
  dot?: boolean
  /** Optional leading icon (Phosphor node); mutually complementary with `dot`. */
  icon?: React.ReactNode
  /** Native tooltip — e.g. a "live state" chip surfacing its last-event time. */
  title?: string
  className?: string
  children: React.ReactNode
}

export function StatusChip({ tone = 'neutral', dot, icon, title, className, children }: StatusChipProps) {
  return (
    <span
      title={title}
      className={cn(
        // The frame is one hairline; the transition is the house one, so a tone
        // flip (Up → Down, Active → Revoked) eases instead of cutting (M7).
        'inline-flex items-center gap-1.5 px-2 py-px rounded-none border border-neutral-800 text-xs font-medium whitespace-nowrap',
        'transition-colors duration-fast ease-apple motion-reduce:transition-none',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_COLOR[tone])} />}
      {icon}
      {children}
    </span>
  )
}
