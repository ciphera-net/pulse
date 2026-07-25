'use client'

import { AnimatedNumber } from '@/components/ui/animated-number'

// ---------------------------------------------------------------------------
// StepHeader — the shared per-step header for both journey views (DOM in both,
// so typography stays identical and accessible). Micro-label per the label
// rule: 1–2-word uppercase data label, mono, tracking-[0.08em].
// ---------------------------------------------------------------------------

interface StepHeaderProps {
  index: number
  visitors: number
  dropOffPercent: number
}

export function StepHeader({ index, visitors, dropOffPercent }: StepHeaderProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-[0.08em] text-neutral-500">
        Step {index + 1}
      </span>
      <div className="flex items-baseline gap-1.5">
        <AnimatedNumber
          value={visitors}
          format={(v) => Math.round(v).toLocaleString()}
          className="text-sm font-semibold tabular-nums text-white"
        />
        <span className="text-xs text-neutral-500">visitors</span>
        {dropOffPercent !== 0 && (
          <span className={`text-xs font-medium tabular-nums ${dropOffPercent < 0 ? 'text-red-400' : 'text-green-400'}`}>
            {dropOffPercent > 0 ? '+' : ''}{dropOffPercent}%
          </span>
        )}
      </div>
    </div>
  )
}
