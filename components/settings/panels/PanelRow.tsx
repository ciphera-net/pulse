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
  // The label text carries an id so a NON-native control in the `control` slot
  // (Facet's Toggle is a role="switch" button, which a <label htmlFor> cannot
  // name) can be labelled by it: the control element is cloned with
  // aria-labelledby unless it already names itself. Without this every switch
  // on the settings surface had no accessible name (settings tail, item 9).
  const generatedId = React.useId()
  const labelId = label ? generatedId : undefined
  const labelNode = label ? (
    htmlFor ? (
      <label id={labelId} htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
    ) : (
      <span id={labelId} className="block text-sm font-medium text-foreground">
        {label}
      </span>
    )
  ) : null

  // Only a control with no content and no name of its own is renamed: a
  // Button in the slot has its text (and aria-labelledby would override it
  // with the row label), an icon button carries its own aria-label; Facet's
  // Toggle has neither, which is exactly the switch that had no name. Decided
  // by props, not by component identity, so a test that mocks Facet without
  // exporting Toggle is not broken by an import here.
  const nameless =
    React.isValidElement<Record<string, unknown>>(control) &&
    control.props.children == null &&
    !control.props['aria-label'] &&
    !control.props['aria-labelledby']
  const controlNode =
    labelId && nameless
      ? React.cloneElement(control as React.ReactElement<Record<string, unknown>>, { 'aria-labelledby': labelId })
      : control

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
        // Round two (S3): a row whose only control is a toggle, chip or button
        // gives the label the room, so a caption no longer wraps at 220px beside
        // 500px of nothing; a row with a value keeps a label column that grows
        // with the row (minmax(220px,30%)) instead of a fixed 220px.
        hasValue ? 'md:grid-cols-[minmax(220px,30%)_1fr_auto]' : 'md:grid-cols-[minmax(0,1fr)_auto]',
        'md:items-center',
        className,
      )}
    >
      <div className="min-w-0 md:col-start-1 md:row-start-1">
        {labelNode}
        {/* A readable measure: the caption may take the row, never the whole width. */}
        {caption && <p className="mt-0.5 max-w-[56ch] text-xs text-muted-foreground">{caption}</p>}
      </div>
      {/* S7: a field is a field. The value cell caps at max-w-md so an input
          reads as a field and not as a column stretched to the frame. */}
      {hasValue && <div className="min-w-0 md:col-start-2 md:row-start-1 md:max-w-md">{children}</div>}
      {controlNode && (
        <div className="md:col-start-3 md:row-start-1 md:justify-self-end">{controlNode}</div>
      )}
    </div>
  )
}

export default PanelRow
