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
 * `variant="card"` (default) is a bordered block for a whole-section failure;
 * `variant="banner"` is a compact inline strip for a sub-section that failed
 * while the rest of the tab rendered.
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
        className={`flex items-start gap-3 p-3 rounded-none bg-amber-900/20 border border-amber-900/40 text-sm ${className ?? ''}`}
      >
        <WarningCircle size={16} weight="fill" className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 flex-1">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="text-amber-200 underline font-medium hover:text-white transition-colors duration-fast ease-apple disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-4 rounded-none border border-red-900/40 bg-red-900/10 ${className ?? ''}`}
    >
      <WarningCircle size={28} weight="fill" className="text-red-400 mb-3" />
      <p className="text-sm text-neutral-300 max-w-sm mb-4">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="text-sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      )}
    </div>
  )
}
