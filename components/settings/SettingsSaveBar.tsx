'use client'

import { useState } from 'react'
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

  if (!isDirty && !saved) return null

  return (
    <div
      className={`sticky bottom-0 -mx-6 -mb-6 px-6 py-3 flex items-center justify-between rounded-b-2xl border-t border-white/[0.06] bg-neutral-950/90 backdrop-blur-sm transition-all duration-base ease-apple ${
        isDirty || saved ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
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
  )
}
