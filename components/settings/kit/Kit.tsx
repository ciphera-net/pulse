'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The settings kit: the parts every settings page is drawn with (settings overhaul, round 2, 05-11-2026; record
 * Pulse/docs/plans/05-11-2026-settings-overhaul-plan.md §3b).
 *
 * - R5, headings and hairlines: no panels. A section is a heading (16 px semibold) and one line, then its rows between
 *   two hairlines; sections 48 px apart. Rows are 16 px top and bottom and 0 at the sides; one label size (14 px,
 *   medium), one caption size (12 px, muted, 56 characters wide at most); values at most 448 px wide; controls on the
 *   right edge.
 * - R6, an icon on every heading, in Pulse's colours only: orange, and coral on a Danger zone. Rows carry no icon,
 *   except a state that keeps its colour and a platform's own logo (R9).
 * - R8, a switch that is on draws a white knob. Facet's Toggle paints its knob `bg-white`, and Pulse's light theme
 *   turns Tailwind's `white` into ink (`--white: 10 10 10`, styles/themeRamp.ts), so an on switch drew a near-black
 *   knob on orange. A switch that is off keeps today's knob in both themes.
 * - R24 and R32, list rows: the status leads the caption as a dot and words (orange when live, grey when off, coral
 *   when broken), every row's buttons in the same places, and its last glyph on the section's right edge.
 *
 * The `data-kit-*` attributes name the parts for the checks that compare a page with its approved drawing.
 */

export type KitTone = 'neutral' | 'orange' | 'coral'

const INK: Record<KitTone, string> = {
  neutral: 'text-muted-foreground',
  orange: 'text-primary',
  coral: 'text-destructive',
}

/** The page: its sections 48 px apart. Also where the on switch's knob turns white (R8). */
export function KitPage({ children }: { children: React.ReactNode }) {
  return (
    // A literal white (`#fff`): Tailwind's `white` is the light theme's ink.
    <div data-kit="" className="space-y-12 [&_[role=switch][aria-checked=true]>span]:bg-[#fff]">
      {children}
    </div>
  )
}

export function KitSection({
  title,
  description,
  tone = 'default',
  aside,
  icon,
  children,
}: {
  title: string
  description?: React.ReactNode
  /** A Danger zone: its heading and icon in coral. */
  tone?: 'default' | 'danger'
  /** A button or a short state at the right of the heading (a section's own action, R13). */
  aside?: React.ReactNode
  /** The heading's icon (R6), orange, or coral on a Danger zone. */
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  const danger = tone === 'danger'
  // A section with nothing under its heading (a heading, a line and a button) draws no empty pair of hairlines.
  const hasBody = React.Children.toArray(children).length > 0
  return (
    <section data-kit-section={title}>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 pb-3">
        <div className="min-w-0">
          <h2 className={cn('flex items-center gap-2 text-base font-semibold tracking-tight', danger ? 'text-destructive' : 'text-foreground')}>
            {icon && (
              <span data-kit-icon="heading" className={cn('flex shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]', danger ? INK.coral : INK.orange)}>
                {icon}
              </span>
            )}
            {title}
          </h2>
          {description && <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{description}</p>}
        </div>
        {aside && <div data-kit-aside="" className="shrink-0 pt-0.5">{aside}</div>}
      </header>
      {hasBody && <div className="border-y border-border">{children}</div>}
    </section>
  )
}

/** A section's rows, a hairline between each. */
export function KitRows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>
}

/** A full-width row for something that is not a label and a value (the script itself, a table). */
export function KitBlock({ children }: { children: React.ReactNode }) {
  return (
    <div data-kit-block="" className="py-4">
      {children}
    </div>
  )
}

export function KitRow({
  label,
  caption,
  control,
  htmlFor,
  icon,
  tone = 'neutral',
  state = false,
  logo = false,
  children,
}: {
  label: React.ReactNode
  caption?: React.ReactNode
  /** Buttons or a switch, on the row's right edge. */
  control?: React.ReactNode
  htmlFor?: string
  /** Drawn only for a state (`state`) or a platform's own logo (`logo`); rows otherwise carry no icon (R6). */
  icon?: React.ReactNode
  /** A state icon's colour meaning: orange live, grey off, coral broken (R32). */
  tone?: KitTone
  state?: boolean
  /** A platform's own logo (R9), drawn in its own colours. */
  logo?: boolean
  /** A value (a field, a text) in the middle column, at most 448 px wide. */
  children?: React.ReactNode
}) {
  const hasValue = children !== undefined && children !== null && children !== false
  const iconEl = !icon || !(state || logo) ? null : logo ? (
    <span data-kit-icon="logo" className="flex h-5 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
  ) : (
    <span data-kit-icon="state" className={cn('flex h-5 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4', INK[tone])}>{icon}</span>
  )
  const labelEl = htmlFor ? (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {label}
    </label>
  ) : (
    <span className="block text-sm font-medium text-foreground">{label}</span>
  )
  return (
    <div
      data-kit-row=""
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-2 py-4 md:items-center',
        hasValue ? 'md:grid-cols-[minmax(200px,32%)_minmax(0,1fr)_auto]' : 'md:grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      <div className={cn('min-w-0', iconEl && 'flex items-start gap-3')}>
        {iconEl}
        <div className="min-w-0">
          {labelEl}
          {caption && <p className="mt-0.5 max-w-[56ch] text-xs text-muted-foreground">{caption}</p>}
        </div>
      </div>
      {hasValue && <div className="min-w-0 md:max-w-md">{children}</div>}
      {control && <div className="flex items-center gap-2 md:justify-self-end">{control}</div>}
    </div>
  )
}

/** Figures side by side, a label over each number (General's bot counts, Billing's plan, R35). */
export function KitStats({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-border">
      {items.map((it, i) => (
        <div key={it.label} className={cn('min-w-0 py-4', i === 0 ? 'pr-5' : 'px-5')}>
          <p className="text-xs text-muted-foreground">{it.label}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-foreground tabular-nums">{it.value}</p>
        </div>
      ))}
    </div>
  )
}

/** R24 and R32: a row's status, leading its caption as a dot and words. */
export function KitStatus({ tone, children }: { tone: 'live' | 'off' | 'broken'; children: React.ReactNode }) {
  return (
    <span data-kit-status={tone} className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone === 'live' ? 'bg-primary' : tone === 'broken' ? 'bg-destructive' : 'bg-neutral-400')} />
      <span className={tone === 'live' ? 'text-primary' : tone === 'broken' ? 'text-destructive' : undefined}>{children}</span>
    </span>
  )
}
