'use client'
import { useEffect, useState, useRef } from 'react'
import { Toggle } from '@ciphera-net/facet'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { getCategorySettings, updateCategorySettings, type CategorySetting } from '@/lib/api/notifications-webhooks'

export default function CategoryTogglesSection() {
  const [settings, setSettings] = useState<Record<string, boolean> | null>(null)
  const [categories, setCategories] = useState<CategorySetting[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
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
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateCategorySettings({ [id]: next[id] })
        setError(null)
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
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        Disable a category to prevent new notifications of that type from being created for the workspace. Billing and security alerts are always delivered and cannot be disabled.
      </p>
      <ul className="divide-y divide-neutral-800 rounded-none border border-neutral-800 bg-neutral-800/30">
        {categories.map(c => {
          const critical = c.id === 'billing' || c.id === 'security'
          const enabled = settings[c.id] ?? true
          return (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white flex items-center gap-2">
                  {c.label}
                  {critical && <span className="text-micro-label uppercase tracking-wider text-brand-orange border border-brand-orange/30 rounded-none px-1.5 py-0.5">Always on</span>}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">{c.description}</p>
                {(c.id === 'security' || c.id === 'team' || c.id === 'system') && (
                  <p className="text-xs text-neutral-600 mt-0.5 italic">No notifications of this type are being generated yet.</p>
                )}
              </div>
              <Toggle
                checked={critical ? true : enabled}
                onChange={() => !critical && toggle(c.id)}
                disabled={critical}
                aria-label={`Toggle ${c.label}`}
              />
            </li>
          )
        })}
      </ul>
      {(saving || error) && (
        <div className="text-xs">
          {saving && <span className="text-neutral-500">Saving…</span>}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      )}
    </div>
  )
}
