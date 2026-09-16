import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * SettingsTH — a table head cell in the dashboard's recipe (round two, S4):
 * sentence case, text-xs, medium, muted, no tracking. Facet's own `TH` sets
 * an uppercase tracked micro-label, the one idiom §6.1 retired for section
 * titles and the readers found again on Billing, Devices and Audit. Same
 * padding and hairline as Facet's so a row lines up either way.
 */
export function SettingsTH({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        'border-b border-border px-4 py-2.5 text-left align-middle text-xs font-medium text-muted-foreground',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...props}
    />
  )
}
