'use client'

import { Button } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import type { ImportMessage } from '@/lib/import/messages'

/** A stable code (`batch_out_of_order`) is machine data and reads in mono; a sentence never does. */
const isCode = (s: string) => /^[a-z0-9_.:-]+$/.test(s)

/**
 * "Details" under a failure, when the error map has something for support: the server's own code for a value this
 * build does not know, or the source's own words for a refused token.
 */
export function ErrorDetails({ message }: { message: ImportMessage }) {
  if (!message.details) return null
  return (
    <details className="mt-1" data-testid="import-error-details">
      <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
      <p className={cn('mt-1 break-all text-xs text-muted-foreground', isCode(message.details) && 'font-mono')}>{message.details}</p>
    </details>
  )
}

/**
 * A failure where it happened (R51, option B): coral words in a row of their own, never a box, with Try again on the
 * right edge when the same request can simply be sent again. The file's own refusal is said under the file instead
 * (Dropzone).
 */
export function ImportErrorLine({
  message,
  onRetry,
  retrying = false,
}: {
  message: ImportMessage
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div role="alert" data-import-error="line" className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="max-w-[56ch] text-xs text-destructive">{message.text}</p>
        <ErrorDetails message={message} />
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="shrink-0">
          Try again
        </Button>
      )}
    </div>
  )
}
