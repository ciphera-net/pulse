'use client'
import { useEffect, useState, useRef } from 'react'
import { Toggle, Banner } from '@ciphera-net/facet'
import { Check } from '@phosphor-icons/react'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { getCategorySettings, updateCategorySettings, type CategorySetting } from '@/lib/api/notifications-webhooks'

export default function CategoryTogglesSection() {
  const [settings, setSettings] = useState<Record<string, boolean> | null>(null)
  const [categories, setCategories] = useState<CategorySetting[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [saving, setSaving] = useState(false)
  // Auto-save stays instant here (toggles are direct controls) — but a success
  // needs a visible confirmation, not just the absence of "Saving…". Mirror the
  // WorkspaceRolesTab chip pattern: a transient "Saved" chip after each write.
  const [savedIndicator, setSavedIndicator] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  const load = () =>
    getCategorySettings()
      .then(r => {
        setSettings(r.settings ?? {})
        setCategories(r.categories ?? [])
        setError(null)
      })
      .catch(e => setError(e.message ?? 'Failed to load'))

  useEffect(() => { load() }, [])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const toggle = (id: string) => {
    if (!settings) return
    const prev = { ...settings }
    const next = { ...settings, [id]: !settings[id] }
    setSettings(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setSavedIndicator(false)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateCategorySettings({ [id]: next[id] })
        setError(null)
        setSavedIndicator(true)
        savedTimer.current = setTimeout(() => setSavedIndicator(false), 2000)
      } catch (e) {
        setSettings(prev)
        setError((e as Error).message ?? 'Failed to save')
      } finally {
        setSaving(false)
      }
    }, 300)
  }

  if (error && !settings) return <SettingsErrorState message={error} onRetry={retry} retrying={retrying} />
  if (!settings) return <SettingsLoadingState />

  return (
    <div className="space-y-3">
      <SettingsPanel
        kicker="Categories"
        description="Disable a category to stop new notifications of that type from being created for everyone in the workspace. Billing and security alerts are always delivered and cannot be disabled."
        action={
          saving ? (
            <span className="font-semibold text-micro-label uppercase text-muted-foreground">Saving…</span>
          ) : savedIndicator ? (
            <StatusChip tone="success" icon={<Check weight="bold" className="h-3 w-3" />}>
              Saved
            </StatusChip>
          ) : undefined
        }
      >
        <PanelRows>
          {categories.map(c => {
            const critical = c.id === 'billing' || c.id === 'security'
            const enabled = settings[c.id] ?? true
            const noneYet = c.id === 'security' || c.id === 'team' || c.id === 'system'
            return (
              <PanelRow
                key={c.id}
                label={c.label}
                caption={
                  <>
                    {c.description}
                    {noneYet && (
                      <span className="mt-0.5 block italic text-muted-foreground/70">
                        No notifications of this type are being generated yet.
                      </span>
                    )}
                  </>
                }
                control={
                  critical ? (
                    // Locked category: Toggle rendered ON + disabled (unambiguous,
                    // control-state orange) with an "Always on" micro-label cap —
                    // never a gray-off switch, never an orange badge.
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-micro-label uppercase text-muted-foreground">
                        Always on
                      </span>
                      <Toggle checked disabled onChange={() => {}} />
                    </div>
                  ) : (
                    <Toggle checked={enabled} onChange={() => toggle(c.id)} />
                  )
                }
              />
            )
          })}
        </PanelRows>
      </SettingsPanel>

      {error && (
        <Banner tone="danger" title="Couldn't save that change">
          {error}
        </Banner>
      )}
    </div>
  )
}
