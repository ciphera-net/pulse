'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { usePanelIndex } from './PanelSequence'

/**
 * SettingsPanel — the bordered frame every settings group lives in.
 *
 * A hairline-bordered, 0-radius surface on `bg-card`. When a `title` is given
 * it renders a header row (the title, an optional one-line description, a
 * right-aligned `action`) ruled off from the body by a hairline. Body is
 * whatever children you pass — typically a `<PanelRows>` of `<PanelRow>`s.
 *
 * The title is set the way the dashboard sets a section title
 * (`components/dashboard/SectionHeader`): sentence case, `text-sm
 * font-semibold tracking-tight`, foreground. The uppercase tracked micro-label
 * this panel used to carry was a July idiom no dashboard surface ever adopted,
 * and it was the single biggest reason settings did not read as Pulse
 * (settings overhaul, 16-09-2026, §4.8).
 *
 * `tone="danger"` marks a destructive zone: the title turns coral
 * (`destructive`); the frame stays the house hairline like every other panel
 * (round two, S6: the tinted border was the one coloured edge on the surface).
 * Colour lives in the word, never in a tinted surface or frame.
 *
 * Motion (round two, M1): inside the settings shell each panel rises 8px into
 * place on the house curve, 60ms after the panel before it; the shell's
 * PanelSequence hands out the index. Outside it, or under reduced motion, the
 * panel is simply there.
 *
 * Accessibility: renders a landmark `<section>`; when `title` is present the
 * header is the panel's visual + reading label.
 */
export interface SettingsPanelProps {
  /** Sentence-case title. Presence of a title draws the header hairline. */
  title?: React.ReactNode
  /** One-line muted description under the title. */
  description?: React.ReactNode
  /** Right-aligned header slot (a Button, a StatusChip, a Select…). */
  action?: React.ReactNode
  tone?: 'default' | 'danger'
  className?: string
  children: React.ReactNode
}

export function SettingsPanel({
  title,
  description,
  action,
  tone = 'default',
  className,
  children,
}: SettingsPanelProps) {
  const danger = tone === 'danger'
  const hasHeader = Boolean(title || description || action)
  // Stable id so the landmark <section> can be labelled by its own heading
  // (only wired when a title is actually rendered).
  const titleId = React.useId()
  const index = usePanelIndex()
  const reduced = useReducedMotion()
  const rises = index !== null && !reduced

  return (
    <motion.section
      aria-labelledby={title ? titleId : undefined}
      className={cn('rounded-none border border-border bg-card', className)}
      initial={rises ? { opacity: 0, y: 8 } : false}
      animate={rises ? { opacity: 1, y: 0 } : undefined}
      transition={rises ? { duration: DURATION_BASE, ease: EASE_APPLE, delay: (index ?? 0) * 0.06 } : undefined}
    >
      {hasHeader && (
        <header
          className={cn(
            // Column below md. A text block beside a `shrink-0` action: on a
            // phone the action claimed its full intrinsic width and crushed the
            // description to 40-50% of the viewport. Stacking gives the copy
            // the full width; md+ is the row.
            'flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:gap-4',
            // The hairline only appears once the panel is actually titled — an
            // action-only header floats over the body without a rule.
            title && 'border-b border-border',
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2
                id={titleId}
                className={cn(
                  'flex items-center gap-2 text-sm font-semibold tracking-tight',
                  danger ? 'text-destructive' : 'text-foreground',
                )}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className={cn('text-sm text-muted-foreground', title && 'mt-1')}>
                {description}
              </p>
            )}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      {children}
    </motion.section>
  )
}

export default SettingsPanel
