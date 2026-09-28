'use client'

import { useId, useRef, useState } from 'react'
import { UploadSimple } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * The file chooser: a dashed hairline that opens a hidden `<input type="file">`
 * and takes a dropped file. The device is FunnelModal's dashed "+ Add" hairline
 * (§3.10a), never a tinted wash: colour lives in a dot or a word.
 *
 * The file never leaves the browser: this component only hands it to the caller.
 */
export function Dropzone({
  lead,
  sub,
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  'aria-describedby': describedBy,
}: {
  lead: string
  sub: string
  accept: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
  'aria-describedby'?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [over, setOver] = useState(false)

  const take = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <>
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
        aria-describedby={describedBy}
        data-testid="import-dropzone"
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-none border border-dashed px-4 py-6 text-center text-sm text-neutral-500 transition-colors duration-fast ease-apple hover:border-neutral-600 hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          over ? 'border-neutral-600 text-neutral-300' : 'border-border',
        )}
      >
        <UploadSimple className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">{lead}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </button>
      <input
        ref={inputRef}
        id={inputId}
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
    </>
  )
}
