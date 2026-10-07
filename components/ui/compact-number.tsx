'use client'

import { Tooltip, type TooltipProps } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { EM_DASH, formatCompactNumber, formatNumber } from '@/lib/utils/format'

interface CompactNumberProps {
  /** The raw count. Null/undefined renders the em dash — never a fabricated 0. */
  value: number | null | undefined
  className?: string
  side?: TooltipProps['side']
  align?: TooltipProps['align']
  /**
   * Custom rendering for the visible text — e.g. `<AnimatedNumber format={formatCompactNumber} />`
   * for a KPI tile that counts up. Defaults to the plain compact string. Either
   * way the exact value (not whatever this renders mid-animation) is what the
   * Tooltip and `aria-label` carry, because those are read once, at rest.
   */
  children?: React.ReactNode
}

/**
 * A large count, shown compact ("4.2M"), with the exact value ("4,218,903")
 * reachable on hover/focus via Facet's `Tooltip` and carried as the element's
 * `aria-label` — the accessible name, not merely text inside a panel only a
 * sighted mouse user would ever reach (owner ruling D11, 01-10-2026,
 * PULSE-190; mocked in
 * Pulse/docs/data/01-10-2026-number-format-mocks/README.md).
 *
 * Below 10,000 the compact and exact forms are byte-identical (`formatCompactNumber`
 * falls back to `formatNumber` there), so this renders a plain span with no
 * tooltip and no extra focus stop — a hover affordance over text that cannot
 * change on hover is noise, not help.
 *
 * `Tooltip`, not `InfoTip`: InfoTip's own docs reserve it for a surface's
 * NAME ("never on repeated value rows") — this is exactly a repeated value
 * row. `Tooltip` is Facet's stated general primitive for this shape.
 */
export function CompactNumber({ value, className, side = 'top', align = 'center', children }: CompactNumberProps) {
  if (value === null || value === undefined) {
    return <span className={cn('tabular-nums', className)}>{EM_DASH}</span>
  }

  const exact = formatNumber(value)
  const compact = formatCompactNumber(value)
  const content = children ?? compact

  if (compact === exact) {
    return <span className={cn('tabular-nums', className)}>{content}</span>
  }

  return (
    <Tooltip content={exact} side={side} align={align}>
      <span tabIndex={0} aria-label={exact} className={cn('tabular-nums cursor-help', className)}>
        {content}
      </span>
    </Tooltip>
  )
}
