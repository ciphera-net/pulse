'use client'
import type { Preferences, DeliveryMode } from '@/lib/api/notifications-preferences'

const CATEGORIES = [
  { id: 'billing', label: 'Billing', critical: true },
  { id: 'security', label: 'Security', critical: true },
  { id: 'uptime', label: 'Uptime monitoring', critical: false },
  { id: 'site', label: 'Site events', critical: false },
  { id: 'team', label: 'Team activity', critical: false },
  { id: 'system', label: 'Platform announcements', critical: false },
] as const

const MODES: { value: DeliveryMode; label: string }[] = [
  { value: 'in_app_only', label: 'In-app only' },
  { value: 'email_immediate', label: 'Email immediate' },
  { value: 'email_digest', label: 'Email digest' },
  { value: 'off', label: 'Off' },
]

interface Props {
  prefs: Preferences
  onChange: (next: Preferences) => void
}

export default function DeliveryModesTable({ prefs, onChange }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-500 uppercase tracking-wider">
            <th className="text-left py-2 font-normal">Category</th>
            {MODES.map(m => (
              <th key={m.value} className="text-center py-2 font-normal px-2 whitespace-nowrap">{m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(c => (
            <tr key={c.id} className="border-t border-white/[0.05]">
              <td className="py-3 text-neutral-200">{c.label}</td>
              {MODES.map(m => (
                <td key={m.value} className="text-center">
                  <input
                    type="radio"
                    name={`mode-${c.id}`}
                    checked={prefs.delivery_modes[c.id] === m.value}
                    onChange={() => onChange({
                      ...prefs,
                      delivery_modes: { ...prefs.delivery_modes, [c.id]: m.value }
                    })}
                    className="accent-brand-orange cursor-pointer"
                    aria-label={`Set ${c.label} to ${m.label}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
