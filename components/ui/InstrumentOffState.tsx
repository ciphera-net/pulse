'use client'

import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * The one instrument-off state (closeout ruling 1b, variant V2) — every
 * instrument page renders its off/not-connected state through this shell:
 * ghost rails naming what the page becomes, then Pulse's one empty state
 * (R57, 16-11-2026: the icon alone, the heading and sentence, an optional
 * configure-before-enable slot, and ONE action in the bordered button),
 * enabling in place where the page can enable and navigating where the
 * connection lives in Settings.
 *
 * Permission is part of the component: without the required capability the
 * action is not offered, and the fallback line says who can (the uptime
 * page's device, promoted).
 */
export interface InstrumentOffStateProps {
  /** Ghost rail labels — the page's own metric names, in rail order. */
  rails: string[]
  /** The instrument's glyph (the sidebar's identity). */
  icon: ReactNode
  heading: string
  body: ReactNode
  /** Configure-before-enable controls (Performance's frequency Select). */
  config?: ReactNode
  canAct: boolean
  action:
    | { label: string; onClick: () => void; disabled?: boolean; href?: never }
    | { label: string; href: string; onClick?: never; disabled?: never }
  /** Fallback line for members without the capability. */
  fallback?: string
}

export function InstrumentOffState({
  rails,
  icon,
  heading,
  body,
  config,
  canAct,
  action,
  fallback = 'An owner or admin can enable it.',
}: InstrumentOffStateProps) {
  return (
    <div className="flex rounded-none border border-border bg-card">
      {/* Ghost rails — what the page becomes once enabled */}
      <div className="hidden w-48 shrink-0 flex-col border-r border-border sm:flex" aria-hidden="true">
        {rails.map((label) => (
          <div
            key={label}
            className="flex flex-1 flex-col justify-center border-t border-border px-4 py-4 first:border-t-0"
          >
            <span className="text-sm text-neutral-600">{label}</span>
            <span className="mt-0.5 text-xl font-semibold text-neutral-700">&mdash;</span>
          </div>
        ))}
      </div>
      <EmptyState
        icon={icon}
        title={heading}
        description={body}
        action={canAct ? ('href' in action && action.href ? { label: action.label, href: action.href } : { label: action.label, onClick: action.onClick, disabled: action.disabled }) : undefined}
        className="min-h-[360px] flex-1"
      >
        {config && <div className="mt-2">{config}</div>}
        {!canAct && <p className="mt-2 text-xs text-neutral-500">{fallback}</p>}
      </EmptyState>
    </div>
  )
}
