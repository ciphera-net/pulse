'use client'

import * as React from 'react'
import Link from 'next/link'
import { buttonVariants } from '@ciphera-net/facet'
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
  }
  /**
   * Which kind of empty this is (ruling R57, 16-11-2026: one kind for every dashboard block).
   *
   *   page    The default. A whole page with nothing to show yet (no funnels, a site in another team): the icon in
   *           a tinted tile, a large title, the action as the filled orange button.
   *   block   One block among many on the dashboard: the icon alone in the brand's ink, a smaller title, and the
   *           action in the dashboard's own bordered button (Facet's `chrome`, the look of the date button and the
   *           funnel picker). Every empty block draws this one, so a page of empty blocks shows one kind, and no
   *           action shouts in orange six times on one screen.
   */
  variant?: 'page' | 'block'
  className?: string
}

const ACTION_BUTTON =
  'mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-none bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-hover transition-colors duration-fast ease-apple active:scale-[0.97]'
/** The block's action: the dashboard's bordered button, the border brightening under the pointer. */
const ACTION_BLOCK = cn(buttonVariants({ variant: 'chrome', size: 'sm' }), 'mt-2 font-normal ease-apple')

/**
 * Empty state — use in place of inline "No X" fallbacks.
 *
 * Tonal rule: warm, specific, actionable. Never just "No data".
 * Describe what's missing and what the user can do next.
 *
 * Good: "No visitors yet — share your site and check back"
 * Bad: "No data available"
 */
export function EmptyState({ icon, title, description, action, variant = 'page', className }: EmptyStateProps) {
  const block = variant === 'block'
  const actionClass = block ? ACTION_BLOCK : ACTION_BUTTON
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

  if (block) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 py-12 px-6 text-center', className)} data-empty-state="block">
        {icon && <span className="mb-1 text-brand-ink [&_svg]:h-8 [&_svg]:w-8">{icon}</span>}
        <h3 className="text-base font-semibold text-neutral-100">{title}</h3>
        {description && (
          <p className="max-w-sm text-caption text-neutral-400">{description}</p>
        )}
        {actionButton}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 px-6 text-center', className)} data-empty-state="page">
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
