'use client'
import { useCallback, useEffect, useState } from 'react'
import { Banner, Select, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
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

// Order-insensitive deep compare of two preference snapshots. `retention_overrides`
// keys are added/removed/re-added, so plain JSON.stringify would report a false
// dirty on identical-but-reordered maps — canonicalize keys first.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonical((v as Record<string, unknown>)[k])
        return acc
      }, {})
  }
  return v
}

function prefsEqual(a: Preferences, b: Preferences): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

export default function MyPreferencesTab() {
  // Buffered save model (owner-chosen option D): `server` is the last-saved
  // snapshot (source of truth), `draft` holds in-progress edits. Every control
  // edits the draft; Save persists it in one PUT, Discard restores the snapshot.
  const [server, setServer] = useState<Preferences | null>(null)
  const [draft, setDraft] = useState<Preferences | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [purging, setPurging] = useState(false)

  const load = () =>
    getPrefs()
      .then(p => { setServer(p); setDraft(p); setError(null) })
      .catch(e => setError(e.message ?? 'Failed to load'))

  useEffect(() => { load() }, [])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const handleSave = useCallback(async () => {
    if (!draft) return
    try {
      await updatePrefs(draft)
      setServer(draft)
      setError(null)
    } catch (e) {
      // Keep the draft (server is the source of truth only once it accepts the
      // write) and surface the failure in the Banner below.
      setError((e as Error).message ?? 'Failed to save')
      throw e
    }
  }, [draft])

  const handleDiscard = useCallback(() => {
    setDraft(server)
    setError(null)
  }, [server])

  // Load failure — an honest error state, never an empty panel.
  if (error && !server) return <SettingsErrorState message={error} onRetry={retry} retrying={retrying} />
  if (!draft || !server) return <SettingsLoadingState />

  const isDirty = !prefsEqual(draft, server)

  // Detect IANA timezones available in this browser. `Intl.supportedValuesOf`
  // returns the canonical zone list but OMITS 'UTC' — and it can lack a legacy
  // stored zone too — so the current value would match no option and Radix Select
  // would render a blank trigger. Always fold 'UTC' and the current value in.
  const currentTimezone = draft.timezone || 'UTC'
  const timezones = (() => {
    let zones: string[]
    try { zones = Intl.supportedValuesOf('timeZone') } catch { zones = [] }
    return Array.from(new Set(['UTC', currentTimezone, ...zones]))
  })()

  return (
    <>
      <SettingsPanel kicker="Delivery" description="How you get notified for each category.">
        <DeliveryModesTable prefs={draft} onChange={setDraft} />
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
                value={draft.digest_time ?? '09:00'}
                onChange={e => setDraft({ ...draft, digest_time: e.target.value })}
                aria-label="Digest send time"
              />
              <div className="w-64">
                <Select
                  aria-label="Timezone"
                  size="sm"
                  value={currentTimezone}
                  onChange={v => setDraft({ ...draft, timezone: v })}
                  placeholder="Select timezone"
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
        <QuietHoursSection prefs={draft} onChange={setDraft} />
      </SettingsPanel>

      <SettingsPanel
        kicker="Retention"
        description="Tighten how long Ciphera keeps your read notifications. You can only shorten retention, never extend it."
      >
        <RetentionOverridesTable prefs={draft} onChange={setDraft} />
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

      {error && (
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

      <SettingsSaveBar isDirty={isDirty} onSave={handleSave} onDiscard={handleDiscard} />
    </>
  )
}
