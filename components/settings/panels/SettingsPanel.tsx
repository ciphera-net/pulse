'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * SettingsPanel — the bordered frame every settings group lives in (spec §2.2).
 *
 * A hairline-bordered, 0-radius surface on `bg-card`. When a `kicker` is given
 * it renders a header row (Geist micro-label cap + optional description + right
 * `action`) separated from the body by a `border-b` hairline. Body is whatever
 * children you pass — typically a `<PanelRows>` of `<PanelRow>`s.
 *
 * `tone="danger"` re-skins the frame for destructive zones: the border and the
 * kicker turn coral (`destructive`), the rest of the grammar is unchanged.
 *
 * Accessibility: renders a landmark `<section>`; when `kicker` is present the
 * header is the panel's visual + reading label.
 */
export interface SettingsPanelProps {
  /** Micro-label cap (Geist semibold), rendered UPPERCASE. Presence of a kicker draws the header hairline. */
  kicker?: string
  /** One-line muted description under the kicker. */
  description?: React.ReactNode
  /** Right-aligned header slot (a CTA, a StatusChip, a Select…). */
  action?: React.ReactNode
  tone?: 'default' | 'danger'
  className?: string
  children: React.ReactNode
}

export function SettingsPanel({
  kicker,
  description,
  action,
  tone = 'default',
  className,
  children,
}: SettingsPanelProps) {
  const danger = tone === 'danger'
  const hasHeader = Boolean(kicker || description || action)
  // Stable id so the landmark <section> can be labelled by its own kicker
  // heading (only wired when a kicker is actually rendered).
  const kickerId = React.useId()

  return (
    <section
      aria-labelledby={kicker ? kickerId : undefined}
      className={cn(
        'rounded-none border bg-card',
        danger ? 'border-destructive/30' : 'border-border',
        className,
      )}
    >
      {hasHeader && (
        <header
          className={cn(
            'flex items-start justify-between gap-4 px-5 py-4',
            // The hairline only appears once the panel is actually titled — an
            // action-only header floats over the body without a rule.
            kicker && 'border-b border-border',
          )}
        >
          <div className="min-w-0">
            {kicker && (
              <h2
                id={kickerId}
                className={cn(
                  'font-semibold text-micro-label uppercase',
                  danger ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {kicker}
              </h2>
            )}
            {description && (
              <p className={cn('text-sm text-muted-foreground', kicker && 'mt-1.5')}>
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export default SettingsPanel
