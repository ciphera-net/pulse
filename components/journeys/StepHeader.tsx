'use client'

import { AnimatedNumber } from '@/components/ui/animated-number'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'

// ---------------------------------------------------------------------------
// StepHeader — the shared per-step header for both journey views (DOM in both,
// so typography stays identical and accessible). Micro-label per the label
// rule: 1–2-word uppercase data label, mono, tracking-[0.08em].
//
// Both InfoTip glyphs here are gated to a single column so a canvas with 2–6
// steps never shows the same sentence twice (design record 22-08-2026):
// "Step" explains the column concept itself, so it only ever needs saying on
// the first column (index 0 always exists whenever any column does).
// "Drop-off" only needs saying once too, but WHERE it first appears depends
// on the data — the parent passes `showDropoffTip` for whichever column is
// the first with a nonzero value.
// ---------------------------------------------------------------------------

interface StepHeaderProps {
  index: number
  visitors: number
  dropOffPercent: number
  /** True only for the first column whose drop-off actually renders. */
  showDropoffTip?: boolean
}

export function StepHeader({ index, visitors, dropOffPercent, showDropoffTip }: StepHeaderProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {/* h-4 pins the row to the un-glyphed line height. The glyph's hit
          target is 24px and would otherwise GROW this block — which misaligns
          column 0's page list against every other column in the columns view,
          and overflows the flow view's fixed h-11 header band into the SVG.
          Fixed height lets the transparent hit area overhang harmlessly. */}
      <span className="flex h-4 items-center gap-1 text-xs uppercase tracking-[0.08em] text-neutral-500">
        Step {index + 1}
        {index === 0 && <TermInfoTip term="journey_step" />}
      </span>
      <div className="flex items-baseline gap-1.5">
        <AnimatedNumber
          value={visitors}
          format={(v) => Math.round(v).toLocaleString()}
          className="text-sm font-semibold tabular-nums text-white"
        />
        <span className="text-xs text-neutral-500">visitors</span>
        {dropOffPercent !== 0 && (
          <span className={`flex h-4 items-center gap-1 text-xs font-medium tabular-nums ${dropOffPercent < 0 ? 'text-red-400' : 'text-green-400'}`}>
            {dropOffPercent > 0 ? '+' : ''}{dropOffPercent}%
            {showDropoffTip && <TermInfoTip term="journey_dropoff" />}
          </span>
        )}
      </div>
    </div>
  )
}
