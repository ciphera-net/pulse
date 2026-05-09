'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@ciphera-net/ui'
import { Check } from '@phosphor-icons/react'

interface SettingsSaveBarProps {
  isDirty: boolean
  onSave: () => Promise<void>
  onDiscard: () => void
  saveLabel?: string
}

export default function SettingsSaveBar({ isDirty, onSave, onDiscard, saveLabel = 'Save changes' }: SettingsSaveBarProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

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

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
      <div className="flex items-center justify-between px-5 py-3 rounded-xl border border-neutral-800 bg-neutral-900/95 backdrop-blur-xl shadow-xl shadow-black/40">
        <p className="text-sm text-neutral-400">
          {saved ? (
            <span className="flex items-center gap-1.5 text-green-400">
              <Check className="w-4 h-4" weight="bold" />
              Changes saved
            </span>
          ) : (
            'Unsaved changes'
          )}
        </p>
        {!saved && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : saveLabel}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
