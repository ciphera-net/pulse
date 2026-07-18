'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@ciphera-net/facet'
import { Check } from '@phosphor-icons/react'
import { useSaveBarSlot } from '@/components/settings/shell-slots'

interface SettingsSaveBarProps {
  isDirty: boolean
  onSave: () => Promise<void>
  onDiscard: () => void
  saveLabel?: string
}

export default function SettingsSaveBar({ isDirty, onSave, onDiscard, saveLabel = 'Save changes' }: SettingsSaveBarProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const slot = useSaveBarSlot()

  async function handleSave() {
    setSaving(true)
    try {
      await onSave()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const saveRef = useRef(handleSave)
  saveRef.current = handleSave

  // Guard against navigating away with unsaved edits (unchanged semantics).
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Cmd/Ctrl-S saves (unchanged semantics).
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDirty])

  if (!isDirty && !saved) return null

  const bar = (
    <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-none border border-border bg-card px-5 py-3 shadow-lg">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {saved ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Check className="h-4 w-4" weight="bold" />
            Changes saved
          </span>
        ) : (
          <>
            <span>Unsaved changes</span>
            <kbd className="hidden items-center gap-0.5 rounded-none border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground sm:inline-flex">
              ⌘S
            </kbd>
          </>
        )}
      </p>
      {!saved && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      )}
    </div>
  )

  // Dock into the shell's content-column slot (bottom-center of the column). If
  // rendered outside the settings shell, fall back to a viewport-fixed portal
  // so the bar is never lost.
  if (slot) return createPortal(bar, slot)

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-full max-w-xl -translate-x-1/2 justify-center px-4">
      {bar}
    </div>,
    document.body,
  )
}
