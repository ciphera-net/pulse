'use client'

import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { cn } from '@/lib/utils'
import type { ImportMessage } from '@/lib/import/messages'

/** A stable code (`batch_out_of_order`) is machine data and reads in mono; a sentence never does. */
const isCode = (s: string) => /^[a-z0-9_.:-]+$/.test(s)

/**
 * An import failure, inline on the step that raised it (§3.10a: browser-side and
 * create-time failures sit where they happened; a toast is only for a transient
 * retry that recovered). The settings error banner, plus a "Details" disclosure
 * when the error map has something for support: the server's own code for a value
 * this build does not know, or the source's own words for a refused token.
 */
export function ImportErrorBanner({
  message,
  onRetry,
  retrying,
}: {
  message: ImportMessage
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <SettingsErrorState variant="banner" message={message.text} onRetry={onRetry} retrying={retrying}>
      {message.details ? (
        <details className="mt-1" data-testid="import-error-details">
          <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
          <p className={cn('mt-1 break-all text-xs text-muted-foreground', isCode(message.details) && 'font-mono')}>
            {message.details}
          </p>
        </details>
      ) : null}
    </SettingsErrorState>
  )
}
