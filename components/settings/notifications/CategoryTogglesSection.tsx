'use client'
import { useEffect, useState, useRef } from 'react'
import { getCategorySettings, updateCategorySettings, type CategorySetting } from '@/lib/api/notifications-webhooks'

export default function CategoryTogglesSection() {
  const [settings, setSettings] = useState<Record<string, boolean> | null>(null)
  const [categories, setCategories] = useState<CategorySetting[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getCategorySettings()
      .then(r => {
        setSettings(r.settings ?? {})
        setCategories(r.categories ?? [])
      })
      .catch(e => setError(e.message ?? 'Failed to load'))
  }, [])

  const toggle = (id: string) => {
    if (!settings) return
    const next = { ...settings, [id]: !settings[id] }
    setSettings(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateCategorySettings({ [id]: next[id] })
        setError(null)
      } catch (e) {
        setError((e as Error).message ?? 'Failed to save')
      } finally {
        setSaving(false)
      }
    }, 300)
  }

  if (error && !settings) return <div className="text-red-400 text-sm">{error}</div>
  if (!settings) return <div className="text-neutral-500 text-sm">Loading…</div>

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        Disable a category to prevent new notifications of that type from being created for the workspace. Billing and security alerts are always delivered and cannot be disabled.
      </p>
      <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-white/[0.02]">
        {categories.map(c => {
          const critical = c.id === 'billing' || c.id === 'security'
          const enabled = settings[c.id] ?? true
          return (
            <li key={c.id} className="flex items-center justify-between p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white flex items-center gap-2">
                  {c.label}
                  {critical && <span className="text-micro-label uppercase tracking-wider text-brand-orange border border-brand-orange/30 rounded px-1.5 py-0.5">Always on</span>}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">{c.description}</p>
              </div>
              <label className={`relative inline-flex items-center ${critical ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={critical ? true : enabled}
                  disabled={critical}
                  onChange={() => !critical && toggle(c.id)}
                  aria-label={`Toggle ${c.label}`}
                />
                <div className="w-10 h-5 bg-white/10 peer-checked:bg-brand-orange/60 rounded-full peer-focus:ring-2 peer-focus:ring-brand-orange/30 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5"></div>
              </label>
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
