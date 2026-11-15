'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
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
    /**
     * `link`: a quiet text link in the brand's ink instead of the filled button. For a place where the thing to do
     * is small and optional (the dashboard's empty blocks: "Clear filter", one docs link), and a filled orange
     * button in every empty block would shout six times on one screen.
     */
    variant?: 'button' | 'link'
  }
  className?: string
}

const ACTION_BUTTON =
  'mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-none bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-hover transition-colors duration-fast ease-apple active:scale-[0.97]'
const ACTION_LINK =
  'inline-flex items-center rounded-none text-sm font-medium text-brand-ink underline-offset-4 transition-colors duration-fast ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange'

/**
 * Empty state — use in place of inline "No X" fallbacks.
 *
 * Tonal rule: warm, specific, actionable. Never just "No data".
 * Describe what's missing and what the user can do next.
 *
 * Good: "No visitors yet — share your site and check back"
 * Bad: "No data available"
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const actionClass = action?.variant === 'link' ? ACTION_LINK : ACTION_BUTTON
  const actionButton = action ? (
    action.href ? (
      <Link
        href={action.href}
        onClick={action.onClick}
        {...(action.external ? { target: '_blank', rel: 'noreferrer' } : {})}
        className={actionClass}
      >
        {action.label}
      </Link>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        className={actionClass}
      >
        {action.label}
      </button>
    )
  ) : null

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 px-6 text-center', className)}>
      {icon && (
        <div className="flex h-20 w-20 items-center justify-center rounded-none bg-brand-orange/10 text-brand-ink [&_svg]:h-10 [&_svg]:w-10 ring-1 ring-brand-orange/10">
          {icon}
        </div>
      )}
      <h3 className="text-title-2 font-semibold text-neutral-100">{title}</h3>
      {description && (
        <p className="max-w-sm text-caption text-neutral-400">{description}</p>
      )}
      {actionButton}
    </div>
  )
}
