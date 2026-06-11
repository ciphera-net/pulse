'use client'
import Select from '@/components/ui/select'
import type { Preferences } from '@/lib/api/notifications-preferences'
import type { Category } from '@/lib/notifications/types'
import { RETENTION_DEFAULTS, OVERRIDE_OPTIONS_DAYS } from '@/lib/notifications/retention-policy'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'

interface Props {
  prefs: Preferences
  onChange: (next: Preferences) => void
}

export default function RetentionOverridesTable({ prefs, onChange }: Props) {
  const setOverride = (cat: Category, days: number | null) => {
    const next = { ...prefs.retention_overrides }
    if (days == null) delete next[cat]
    else next[cat] = { read_ttl_days: days }
    onChange({ ...prefs, retention_overrides: next })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-500 uppercase tracking-wider">
            <th className="text-left py-2 font-normal">Category</th>
            <th className="text-left py-2 font-normal">Default</th>
            <th className="text-left py-2 font-normal">Purge my read items after</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_CATEGORIES.map(c => {
            const def = RETENTION_DEFAULTS[c.id].read_ttl_days
            const allowedOpts = OVERRIDE_OPTIONS_DAYS.filter(d => d <= def)
            const current = prefs.retention_overrides?.[c.id]?.read_ttl_days ?? null
            return (
              <tr key={c.id} className="border-t border-neutral-800/60">
                <td className="py-3 text-neutral-200">{c.label}</td>
                <td className="py-3 text-neutral-400">{def} days</td>
                <td className="py-3">
                  <div aria-label={`Read retention override for ${c.label}`}>
                    <Select
                      variant="input"
                      value={String(current ?? '')}
                      onChange={(v) => setOverride(c.id, v === '' ? null : Number(v))}
                      options={[
                        { value: '', label: `Default (${def} days)` },
                        ...allowedOpts.map(d => ({ value: String(d), label: `${d} days` })),
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500 mt-3">
        Overrides can only shorten retention — never extend it. Unread notifications still follow the default unread TTL.
      </p>
    </div>
  )
}
