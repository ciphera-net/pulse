'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@ciphera-net/facet'
import { Check } from '@phosphor-icons/react'
import { useSaveSlot } from '@/components/settings/shell-slots'

interface SettingsSaveBarProps {
  isDirty: boolean
  onSave: () => Promise<void>
  onDiscard: () => void
  saveLabel?: string
}

/**
 * SettingsSaveBar — the buffered-save control for a settings tab (owner-chosen
 * option C: panel-footer save). Public API is unchanged: pass dirty state + a
 * save and discard handler. It renders a full-column-width footer strip into the
 * shell's content-column-end slot, styled as panel anatomy and pinned with
 * `sticky bottom-0` so Save stays in view through a long scroll and settles
 * beneath the last panel at scroll end. The guardrails a save model needs are
 * unchanged — a beforeunload prompt and ⌘/Ctrl-S while dirty.
 *
 * A rejected `onSave` is caught here so it never surfaces as an unhandled
 * rejection and never shows a false "Saved" — the consuming tab owns the error
 * UI (toast / Banner) and keeps the draft, exactly as before.
 */
export default function SettingsSaveBar({ isDirty, onSave, onDiscard, saveLabel = 'Save changes' }: SettingsSaveBarProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const slot = useSaveSlot()

  async function handleSave() {
    setSaving(true)
    try {
      await onSave()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // The consumer surfaces the failure (toast/Banner) and keeps the draft;
      // we only ensure "Saved" is not shown and the rejection is not unhandled.
    } finally {
      setSaving(false)
    }
  }

  const saveRef = useRef(handleSave)
  saveRef.current = handleSave

  // The strip is present while there's anything to show — dirty, an in-flight
  // save, or the brief post-save confirmation.
  const occupied = isDirty || saving || saved

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

  if (!occupied) return null
  // The shell owns the mount node; until it exists (first paint / used outside
  // the settings shell) there is nothing to portal into. The guards above stay
  // active regardless, so unsaved edits are never silently unguarded.
  if (!slot) return null

  // Full-column-width footer strip — panel anatomy (opaque card, hairline
  // border, no backdrop-blur, no resting shadow). `sticky bottom-0` pins it to
  // the viewport bottom while dirty; its containing block is the tall content
  // column (the slot is `display:contents`), so the pin holds the whole scroll.
  const strip = (
    <div className="sticky bottom-0 z-20 border border-border bg-card">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        {saved ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-pos">
            <Check className="h-4 w-4" weight="bold" />
            Saved
          </span>
        ) : (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
            {saving ? 'Saving…' : 'Unsaved changes'}
          </span>
        )}
        {!saved && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
            <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : saveLabel}
            </Button>
            <kbd className="hidden items-center gap-0.5 rounded-none border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground sm:inline-flex">
              ⌘S
            </kbd>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(strip, slot)
}
