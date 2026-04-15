'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
  className?: string
}

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
  const actionButton = action ? (
    action.href ? (
      <Link
        href={action.href}
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-hover transition-colors duration-fast ease-apple active:scale-[0.97]"
      >
        {action.label}
      </Link>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-hover transition-colors duration-fast ease-apple active:scale-[0.97]"
      >
        {action.label}
      </button>
    )
  ) : null

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 px-6 text-center', className)}>
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange [&_svg]:h-8 [&_svg]:w-8">
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
