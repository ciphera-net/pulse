'use client'
import { SegmentedControl } from '@ciphera-net/facet'
import { PanelRow, PanelRows } from '@/components/settings/panels'
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

/**
 * Delivery matrix — one PanelRow per notification category, the mode picker a
 * neutral-selected Facet SegmentedControl (spec §2.3: segmented selection is a
 * control state, never an orange accent — this retires the old six-orange-
 * segments hand-roll).
 *
 * Always-on semantics: critical categories (billing, security) can never be
 * silenced, so the "Off" segment is locked out of their control (it is simply
 * not an option) and a mono "Always on" micro-label captions the row. The user
 * still chooses HOW they're notified — the same behavior the old table allowed
 * by disabling only the Off button.
 */
export default function DeliveryModesTable({ prefs, onChange }: Props) {
  return (
    <PanelRows>
      {NOTIFICATION_CATEGORIES.map(c => {
        const isCritical = c.critical
        const current = prefs.delivery_modes[c.id]
        const options = (isCritical ? MODES.filter(m => m.value !== 'off') : MODES).map(m => ({
          value: m.value,
          label: m.label,
        }))
        return (
          <PanelRow
            key={c.id}
            label={c.label}
            caption={
              isCritical ? (
                <span className="font-mono text-micro-label uppercase text-muted-foreground">
                  Always on
                </span>
              ) : undefined
            }
          >
            <SegmentedControl
              aria-label={`Delivery for ${c.label}`}
              options={options}
              value={current ?? ''}
              onChange={v =>
                onChange({
                  ...prefs,
                  delivery_modes: { ...prefs.delivery_modes, [c.id]: v as DeliveryMode },
                })
              }
            />
          </PanelRow>
        )
      })}
    </PanelRows>
  )
}
