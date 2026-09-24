'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, CopyIcon, toast } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'

/**
 * A block of text to paste somewhere else — a tracking snippet, a terminal command, a config
 * file — with a Copy button in its header. Extracted from ScriptSetupBlock when the MCP page
 * (PULSE-54) became its second consumer, so the two cannot drift apart.
 *
 * "Copied" is shown only once the clipboard write has RESOLVED. A browser that refuses the
 * clipboard gets an error toast asking the person to select the text themselves, instead of a
 * success message for a copy that never happened (the snippet block used to report success
 * unconditionally).
 */
export function CopyBlock({
  label,
  copyName,
  adornment,
  code,
  copiedToast,
  onCopy,
  className,
}: {
  /** The header's small caps label, e.g. "Terminal", "mcp.json", "Tracking script". */
  label: string
  /**
   * What the Copy button says it copies, to assistive technology. Defaults to the label; pass
   * something unique when two blocks on one page share a label (two "Terminal" steps).
   */
  copyName?: string
  /** Anything drawn after the label (the snippet block's tier badge). */
  adornment?: ReactNode
  /** The exact text copied, and shown. */
  code: string
  /** The success toast; omit for none. */
  copiedToast?: string
  /** Called after a successful copy (the snippet block records it). */
  onCopy?: () => void
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(code)
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.")
      return
    }
    setCopied(true)
    if (copiedToast) toast.success(copiedToast)
    onCopy?.()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }, [code, copiedToast, onCopy])

  return (
    <div className={cn('rounded-none border border-border bg-background', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-micro-label uppercase text-muted-foreground truncate">{label}</span>
          {adornment}
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${copyName ?? label}`}
          className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer ease-apple"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              Copy
            </>
          )}
          {/* The aria-label names the button, so the visible Copy/Copied swap is not read out;
              announce the outcome instead (the invite-link button's device). Empty until the
              write resolves, so a refused copy announces nothing but its error toast. */}
          <span aria-live="polite" className="sr-only">{copied ? `${copyName ?? label} copied` : ''}</span>
        </button>
      </div>
      <pre className="px-4 py-4 text-[13px] leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap break-words overflow-x-auto selection:bg-primary/30">
        {code}
      </pre>
    </div>
  )
}
