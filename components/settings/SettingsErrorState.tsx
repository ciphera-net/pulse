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
 * panel grammar (coral hairline, coral glyph, an outline Try again) — a
 * whole-section failure. `variant="banner"` is a compact inline strip for a
 * sub-section that failed while the rest of the tab rendered. Neither tints
 * its surface: colour lives in the glyph and the word.
 *
 * Name the thing that failed in `title` ("Couldn't load your API keys") so the
 * reader knows the blast radius without guessing; `message` then says what to
 * do about it.
 */
interface SettingsErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  retrying?: boolean
  variant?: 'card' | 'banner'
  className?: string
}

export function SettingsErrorState({
  title = "Couldn't load this",
  message = 'This is usually temporary. Try again in a moment.',
  onRetry,
  retrying,
  variant = 'card',
  className,
}: SettingsErrorStateProps) {
  if (variant === 'banner') {
    return (
      <div
        role="alert"
        className={`flex items-center gap-3 rounded-none border border-destructive/30 bg-card px-4 py-3 text-sm ${className ?? ''}`}
      >
        <WarningCircle size={16} weight="fill" className="shrink-0 text-destructive" />
        <p className="min-w-0 flex-1 text-foreground">{message}</p>
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
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
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
          {onRetry && (
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
                {retrying ? 'Retrying…' : 'Try again'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
