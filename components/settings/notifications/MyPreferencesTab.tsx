'use client'
import { useEffect, useState, useRef } from 'react'
import { Input, toast, getAuthErrorMessage } from '@ciphera-net/ui'
import Select from '@/components/ui/select'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { getPrefs, updatePrefs, type Preferences } from '@/lib/api/notifications-preferences'
import { purgeMine } from '@/lib/api/notifications-v2'
import DeliveryModesTable from './DeliveryModesTable'
import QuietHoursSection from './QuietHoursSection'
import RetentionOverridesTable from './RetentionOverridesTable'
import PurgeConfirmDialog from '@/app/notifications/PurgeConfirmDialog'

export default function MyPreferencesTab() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [])

  useEffect(() => {
    getPrefs().then(setPrefs).catch(e => setError(e.message ?? 'Failed to load'))
  }, [])

  const debouncedSave = (next: Preferences) => {
    setPrefs(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updatePrefs(next)
        setError(null)
      } catch (e) {
        setError((e as Error).message ?? 'Failed to save')
      } finally {
        setSaving(false)
      }
    }, 400)
  }

  if (error && !prefs) return <div className="text-red-400 text-sm">{error}</div>
  if (!prefs) return <SettingsLoadingState />

  // Detect IANA timezones available in this browser.
  const timezones = (() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return [prefs.timezone || 'UTC'] }
  })()

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-medium text-white mb-1">Delivery preferences</h3>
        <p className="text-xs text-neutral-500 mb-3">How you get notified per category.</p>
        <DeliveryModesTable prefs={prefs} onChange={debouncedSave} />
      </section>

      <section>
        <h3 className="font-medium text-white mb-1">Daily digest time</h3>
        <p className="text-xs text-neutral-500 mb-3">When your batched non-critical emails are sent.</p>
        <div className="flex items-center gap-3 text-sm">
          <Input
            type="time"
            value={prefs.digest_time ?? '09:00'}
            onChange={e => debouncedSave({ ...prefs, digest_time: e.target.value })}
            aria-label="Digest send time"
          />
          <div aria-label="Timezone" className="max-w-xs">
            <Select
              variant="input"
              value={prefs.timezone || 'UTC'}
              onChange={(v) => debouncedSave({ ...prefs, timezone: v })}
              options={timezones.map(tz => ({ value: tz, label: tz }))}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-medium text-white mb-1">Quiet hours</h3>
        <QuietHoursSection prefs={prefs} onChange={debouncedSave} />
      </section>

      <section>
        <h3 className="font-medium text-white mb-1">Retention — make Ciphera forget sooner</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Tighten how long Ciphera keeps your read notifications. Defaults are listed; you can only go shorter.
        </p>
        <RetentionOverridesTable prefs={prefs} onChange={debouncedSave} />
      </section>

      <section>
        <h3 className="font-medium text-white mb-1 text-red-400">Danger zone</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Permanently delete every notification stored against your account. Other team members' copies are not affected.
        </p>
        <button
          type="button"
          onClick={() => setPurging(true)}
          className="px-4 py-2 text-sm rounded border border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          Delete all my notification history
        </button>
        {purging && (
          <PurgeConfirmDialog
            count={null}
            onCancel={() => setPurging(false)}
            onConfirm={async () => {
              try {
                await purgeMine()
                setPurging(false)
              } catch (err) {
                toast.error(getAuthErrorMessage(err as Error) || 'Failed to purge notifications')
              }
            }}
          />
        )}
      </section>

      {(saving || error) && (
        <div className="text-xs">
          {saving && <span className="text-neutral-500">Saving…</span>}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      )}
    </div>
  )
}
