'use client'
import type { Preferences } from '@/lib/api/notifications-preferences'

interface Props {
  prefs: Preferences
  onChange: (next: Preferences) => void
}

export default function QuietHoursSection({ prefs, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        Non-critical emails suppressed during these hours. Billing and security alerts always deliver.
      </p>
      <div className="flex items-center gap-3 text-sm">
        <input
          type="time"
          value={prefs.quiet_hours_start ?? ''}
          onChange={e => onChange({ ...prefs, quiet_hours_start: e.target.value || null })}
          className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-white focus:border-brand-orange focus:outline-none"
          aria-label="Quiet hours start"
        />
        <span className="text-neutral-500">to</span>
        <input
          type="time"
          value={prefs.quiet_hours_end ?? ''}
          onChange={e => onChange({ ...prefs, quiet_hours_end: e.target.value || null })}
          className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-white focus:border-brand-orange focus:outline-none"
          aria-label="Quiet hours end"
        />
        {(prefs.quiet_hours_start || prefs.quiet_hours_end) && (
          <button
            type="button"
            onClick={() => onChange({ ...prefs, quiet_hours_start: null, quiet_hours_end: null })}
            className="text-xs text-neutral-400 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
