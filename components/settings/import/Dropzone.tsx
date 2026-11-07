'use client'

import { useId, useRef, useState } from 'react'
import { UploadSimple } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { ImportMessage } from '@/lib/import/messages'
import { ErrorDetails } from './ImportErrorLine'

/**
 * The export file, as a field (R51, option B): one dashed line as tall as the settings fields (44 px, the timezone
 * picker under it), the file's name once chosen, and why the import can't use it in coral under it, its edge coral
 * too, as a name the import can't use is said under its field. A click opens a hidden `<input type="file">`, and a
 * file dropped on the line is taken the same way.
 *
 * The file never leaves the browser: this component only hands it to the caller.
 */
export function Dropzone({
  lead,
  sub,
  accept,
  multiple = false,
  disabled = false,
  error = null,
  onFiles,
}: {
  lead: string
  sub: string
  accept: string
  multiple?: boolean
  disabled?: boolean
  /** Why the import can't use the file it was given, said under the field. */
  error?: ImportMessage | null
  onFiles: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const [over, setOver] = useState(false)

  const take = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <div data-import-file="">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!disabled) take(e.dataTransfer.files)
        }}
        // A button takes no aria-invalid: the refusal is announced (role="alert") and named as its description.
        aria-describedby={error ? errorId : undefined}
        data-testid="import-dropzone"
        // 12 px in, not the fields' 14: the icon's own inner space then puts its ink in line with the picker's text below.
        className={cn(
          'flex h-11 w-full items-center gap-2 rounded-none border border-dashed px-3 text-left text-sm transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          // A refused file keeps its coral edge under the pointer too.
          error ? 'border-destructive' : over ? 'border-neutral-600' : 'border-border hover:border-neutral-600',
        )}
      >
        <UploadSimple className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate text-foreground">{lead}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{sub}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="import-file-input"
        onChange={(e) => {
          take(e.target.files)
          // Choosing the same file again (a resume after a failure) must fire again.
          e.target.value = ''
        }}
      />
      {error && (
        <div role="alert" data-import-error="field" className="mt-1.5">
          <p id={errorId} className="text-xs text-destructive">
            {error.text}
          </p>
          <ErrorDetails message={error} />
        </div>
      )}
    </div>
  )
}
