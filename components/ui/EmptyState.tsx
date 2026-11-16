'use client'

import * as React from 'react'
import Link from 'next/link'
import { buttonVariants } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  /**
   * The one thing to do next. `href` navigates, `onClick` acts — and they may
   * now be given TOGETHER: the in-app install links have to record which site
   * they came from (`pulse_active_site`) before the settings page reads it,
   * exactly as InstallBanner does. Before this, an href-action silently
   * dropped its onClick and the settings page opened on whichever site
   * happened to be remembered.
   */
  action?: {
    label: string
    href?: string
    onClick?: () => void
    external?: boolean
    /** An action that acts in place, held while it runs (enabling a monitor). */
    disabled?: boolean
  }
  /**
   * What a state needs between its line and its action: a setting to choose before enabling (Performance's check
   * frequency), or the line that says who can act when this reader cannot.
   */
  children?: React.ReactNode
  className?: string
}

/**
 * The action: the app's bordered button (Facet's `chrome`, the look of the date button and the funnel picker), the
 * border brightening under the pointer. Asked of Facet when an empty state has an action, never when this module
 * loads: tests that replace Facet with a stub of the parts they use import this module too.
 */
const actionClass = () => cn(buttonVariants({ variant: 'chrome', size: 'sm' }), 'mt-2 font-normal ease-apple')

/**
 * Pulse's one empty state (ruling R57, 16-11-2026: one format everywhere). The icon alone in the brand's ink, a
 * title, a short line, and at most one action in the bordered button. A page, a settings section and a dashboard
 * block all draw this one, so the product has one kind of empty, and no action shouts in orange from every empty
 * corner of a screen. Use it in place of any inline "No X" fallback.
 *
 * Tonal rule: warm, specific, actionable. Never just "No data".
 * Describe what's missing and what the user can do next.
 *
 * Good: "No visitors yet — share your site and check back"
 * Bad: "No data available"
 */
export function EmptyState({ icon, title, description, action, children, className }: EmptyStateProps) {
  const actionButton = action ? (
    action.href ? (
      <Link
        href={action.href}
        onClick={action.onClick}
        {...(action.external ? { target: '_blank', rel: 'noreferrer' } : {})}
        className={actionClass()}
      >
        {action.label}
      </Link>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        className={actionClass()}
      >
        {action.label}
      </button>
    )
  ) : null

  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 px-6 text-center', className)} data-empty-state="">
      {icon && <span className="mb-1 text-brand-ink [&_svg]:h-8 [&_svg]:w-8">{icon}</span>}
      <h3 className="text-base font-semibold text-neutral-100">{title}</h3>
      {description && (
        <p className="max-w-sm text-caption text-neutral-400">{description}</p>
      )}
      {children}
      {actionButton}
    </div>
  )
}
