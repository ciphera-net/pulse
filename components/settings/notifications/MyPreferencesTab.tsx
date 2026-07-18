'use client'
import { useEffect, useState, useRef } from 'react'
import { Banner, Select, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { getPrefs, updatePrefs, type Preferences } from '@/lib/api/notifications-preferences'
import { purgeMine } from '@/lib/api/notifications-v2'
import DeliveryModesTable from './DeliveryModesTable'
import QuietHoursSection from './QuietHoursSection'
import RetentionOverridesTable from './RetentionOverridesTable'
import PurgeConfirmDialog from '@/app/notifications/PurgeConfirmDialog'

// Native time input, Input-styled + dark color-scheme (spec §2.3).
const timeInputClass =
  'h-9 rounded-none border border-input bg-transparent px-3 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [color-scheme:dark]'

export default function MyPreferencesTab() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [purging, setPurging] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [])

  const load = () =>
    getPrefs()
      .then(p => { setPrefs(p); setError(null) })
      .catch(e => setError(e.message ?? 'Failed to load'))

  useEffect(() => { load() }, [])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const debouncedSave = (next: Preferences) => {
    // Optimistic update — but keep the last-good value so we can roll back if
    // the server rejects the write (server is the source of truth).
    const prev = prefs
    setPrefs(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updatePrefs(next)
        setError(null)
      } catch (e) {
        setPrefs(prev)
        setError((e as Error).message ?? 'Failed to save')
      } finally {
        setSaving(false)
      }
    }, 400)
  }

  if (error && !prefs) return <SettingsErrorState message={error} onRetry={retry} retrying={retrying} />
  if (!prefs) return <SettingsLoadingState />

  // Detect IANA timezones available in this browser.
  const timezones = (() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return [prefs.timezone || 'UTC'] }
  })()

  return (
    <>
      <SettingsPanel kicker="Delivery" description="How you get notified for each category.">
        <DeliveryModesTable prefs={prefs} onChange={debouncedSave} />
      </SettingsPanel>

      <SettingsPanel
        kicker="Daily digest"
        description="When your batched non-critical emails are sent."
      >
        <PanelRows>
          <PanelRow label="Send time">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="time"
                className={timeInputClass}
                value={prefs.digest_time ?? '09:00'}
                onChange={e => debouncedSave({ ...prefs, digest_time: e.target.value })}
                aria-label="Digest send time"
              />
              <div className="w-64">
                <Select
                  aria-label="Timezone"
                  size="sm"
                  value={prefs.timezone || 'UTC'}
                  onChange={v => debouncedSave({ ...prefs, timezone: v })}
                  options={timezones.map(tz => ({ value: tz, label: tz }))}
                />
              </div>
            </div>
          </PanelRow>
        </PanelRows>
      </SettingsPanel>

      <SettingsPanel
        kicker="Quiet hours"
        description="Non-critical emails are suppressed during these hours. Billing and security alerts always deliver."
      >
        <QuietHoursSection prefs={prefs} onChange={debouncedSave} />
      </SettingsPanel>

      <SettingsPanel
        kicker="Retention"
        description="Tighten how long Ciphera keeps your read notifications. You can only shorten retention, never extend it."
      >
        <RetentionOverridesTable prefs={prefs} onChange={debouncedSave} />
      </SettingsPanel>

      <SettingsPanel
        tone="danger"
        kicker="Danger zone"
        description="Permanently delete every notification stored against your account. Other team members' copies are not affected."
      >
        <div className="px-5 py-4">
          <button
            type="button"
            onClick={() => setPurging(true)}
            className="inline-flex items-center rounded-none border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive"
          >
            Delete all my notification history
          </button>
        </div>
      </SettingsPanel>

      {saving && (
        <p className="font-mono text-micro-label uppercase text-muted-foreground" role="status">
          Saving…
        </p>
      )}
      {error && prefs && (
        <Banner tone="danger" title="Couldn't save your preferences" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}

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
    </>
  )
}
