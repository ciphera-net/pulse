'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * PanelRows — the divide-y wrapper that rules a stack of PanelRows apart.
 *
 * Put this directly inside a `<SettingsPanel>` body; each `<PanelRow>` child
 * gets a hairline between it and the next. Kept separate from SettingsPanel so
 * a panel can also hold non-row content (a RailGrid, a table, an EmptyRow)
 * without inheriting row dividers.
 */
export function PanelRows({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn('divide-y divide-border', className)}>{children}</div>
}

/**
 * PanelRow — the PropertyRow (spec §2.2).
 *
 * A label/value grid: `label` (+ optional muted `caption`) on the left, the
 * main `children` slot in the middle, and an optional right-aligned `control`
 * slot that only splits off on `md`. Pass `htmlFor` to bind the label to a
 * control's id (renders a real `<label>`).
 */
export interface PanelRowProps {
  label?: React.ReactNode
  /** Muted helper text under the label. */
  caption?: React.ReactNode
  /** Right-aligned slot (toggle, button…); occupies the `auto` column on md. */
  control?: React.ReactNode
  /** Binds the label to a control id and renders a semantic `<label>`. */
  htmlFor?: string
  className?: string
  /** Value / main slot. */
  children?: React.ReactNode
}

export function PanelRow({ label, caption, control, htmlFor, className, children }: PanelRowProps) {
  const labelNode = label ? (
    htmlFor ? (
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
    ) : (
      <span className="block text-sm font-medium text-foreground">{label}</span>
    )
  ) : null

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(160px,220px)_1fr] items-center gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[220px_1fr_auto]',
        className,
      )}
    >
      <div className="min-w-0">
        {labelNode}
        {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
      </div>
      <div className="min-w-0">{children}</div>
      {control && <div className="md:justify-self-end">{control}</div>}
    </div>
  )
}

export default PanelRow
