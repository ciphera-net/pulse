'use client'
import { cn } from '@/lib/utils'
import type { Preferences, DeliveryMode } from '@/lib/api/notifications-preferences'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'

const MODES: { value: DeliveryMode; label: string }[] = [
  { value: 'in_app_only', label: 'In-app' },
  { value: 'email_immediate', label: 'Email' },
  { value: 'email_digest', label: 'Digest' },
  { value: 'off', label: 'Off' },
]

interface Props {
  prefs: Preferences
  onChange: (next: Preferences) => void
}

export default function DeliveryModesTable({ prefs, onChange }: Props) {
  return (
    <div className="space-y-1">
      {NOTIFICATION_CATEGORIES.map(c => {
        const isCritical = c.critical
        const current = prefs.delivery_modes[c.id]
        return (
          <div key={c.id} className="flex items-center justify-between py-2.5 px-1 border-t border-neutral-800 first:border-t-0">
            <span className="text-sm text-neutral-200 flex items-center gap-2">
              {c.label}
              {isCritical && (
                <span className="text-micro-label uppercase tracking-wider text-brand-orange border border-brand-orange/30 rounded px-1.5 py-0.5">
                  Always on
                </span>
              )}
            </span>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-neutral-900 border border-neutral-800">
              {MODES.map(m => {
                const isSelected = current === m.value
                const isDisabledOff = isCritical && m.value === 'off'
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      if (isDisabledOff) return
                      onChange({
                        ...prefs,
                        delivery_modes: { ...prefs.delivery_modes, [c.id]: m.value },
                      })
                    }}
                    disabled={isDisabledOff}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md transition-colors',
                      isSelected
                        ? 'bg-brand-orange text-white font-medium'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800',
                      isDisabledOff && 'opacity-40 cursor-not-allowed'
                    )}
                    aria-label={`Set ${c.label} to ${m.label}`}
                    aria-pressed={isSelected}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
