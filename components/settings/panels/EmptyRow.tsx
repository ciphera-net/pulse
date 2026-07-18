'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * EmptyRow — the in-frame empty state (spec §2.3).
 *
 * Left-aligned and sharing the row grammar of a populated panel: a muted
 * Phosphor line icon, a `text-sm` title, an optional muted caption, and an
 * optional inline `action`. NEVER centered, NEVER an orange icon tile.
 *
 * Pass `ghost` to render a faint, non-interactive preview of what a populated
 * row would look like beneath the message — it hints at the shape of the data
 * the user is about to create.
 */
export interface EmptyRowProps {
  /** Phosphor (or any) line icon node — rendered muted, never orange. */
  icon?: React.ReactNode
  title: string
  caption?: React.ReactNode
  /** Inline CTA (a Button / Link). */
  action?: React.ReactNode
  /** Faint, inert preview row rendered under the message. */
  ghost?: React.ReactNode
  className?: string
}

export function EmptyRow({ icon, title, caption, action, ghost, className }: EmptyRowProps) {
  return (
    <div className={cn(className)}>
      <div className="flex items-start gap-3 px-5 py-6">
        {icon && (
          <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {caption && <p className="mt-0.5 text-sm text-muted-foreground">{caption}</p>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
      {ghost && (
        <div
          aria-hidden="true"
          className="select-none border-t border-border opacity-40 pointer-events-none"
        >
          {ghost}
        </div>
      )}
    </div>
  )
}

export default EmptyRow
