'use client'

import * as React from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { Button } from '@ciphera-net/facet'

/**
 * SettingsErrorState — the honest "this fetch failed" surface.
 *
 * Several settings tabs destructured only `{ data }` from SWR and let a failed
 * fetch fall through to an empty state (`goals=[]` → "No goals yet") or an
 * infinite spinner — the exact "no silent failures / never show stale-or-wrong
 * data as if it were real" violation the engineering principles call out. Use
 * this whenever an SWR/fetch `error` is present so a server failure is visibly
 * distinct from a genuine empty result, with a Retry that calls `mutate()`.
 *
 * `variant="card"` (default) is an in-frame, left-aligned block sharing the
 * panel grammar (coral hairline, muted line icon, inline Retry) — a
 * whole-section failure. `variant="banner"` is a compact inline strip for a
 * sub-section that failed while the rest of the tab rendered.
 */
interface SettingsErrorStateProps {
  message?: string
  onRetry?: () => void
  retrying?: boolean
  variant?: 'card' | 'banner'
  className?: string
}

export function SettingsErrorState({
  message = 'Something went wrong loading this. It may be a temporary problem.',
  onRetry,
  retrying,
  variant = 'card',
  className,
}: SettingsErrorStateProps) {
  if (variant === 'banner') {
    return (
      <div
        className={`flex items-start gap-3 rounded-none border border-destructive/30 bg-destructive/10 p-3 text-sm ${className ?? ''}`}
      >
        <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-destructive" />
        <p className="flex-1 text-foreground">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="font-medium text-destructive underline transition-colors duration-fast ease-apple hover:text-foreground disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`rounded-none border border-destructive/30 bg-card ${className ?? ''}`}
      role="alert"
    >
      <div className="flex items-start gap-3 px-5 py-6">
        <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load this</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
          {onRetry && (
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
                {retrying ? 'Retrying…' : 'Try again'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
