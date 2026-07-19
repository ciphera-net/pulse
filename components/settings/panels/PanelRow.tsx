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

  // Only reserve the value cell when there's actually a value to render — a
  // control-only row (a lone Toggle) must not stack an empty box on mobile.
  const hasValue = children !== undefined && children !== null && children !== false

  return (
    <div
      className={cn(
        // Mobile (< md): a single column. The label/caption block, then the value,
        // then the control each take the full row width beneath one another — the
        // fixed `220px` label column crushed inputs to ~70px at 390px otherwise.
        // From md up: the property grid — label | value | right-aligned control.
        'grid grid-cols-1 gap-x-4 gap-y-2 px-5 py-3.5',
        'md:grid-cols-[220px_1fr_auto] md:items-center',
        className,
      )}
    >
      <div className="min-w-0 md:col-start-1 md:row-start-1">
        {labelNode}
        {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
      </div>
      {hasValue && <div className="min-w-0 md:col-start-2 md:row-start-1">{children}</div>}
      {control && (
        <div className="md:col-start-3 md:row-start-1 md:justify-self-end">{control}</div>
      )}
    </div>
  )
}

export default PanelRow
