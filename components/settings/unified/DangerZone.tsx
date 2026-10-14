'use client'

import { Button } from '@ciphera-net/facet'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

interface DangerZoneItem {
  title: string
  description: string
  buttonLabel: string
  /** Opens the row's confirm dialog (a HoldDialog). */
  onClick: () => void
  disabled?: boolean
}

interface DangerZoneProps {
  items: DangerZoneItem[]
}

/**
 * The destructive-outline rung of the button ladder: every danger-zone entry
 * button, and any other control that opens a destructive confirm (an
 * integration's Disconnect, an import's Delete). One danger colour for all of
 * them (PUL-28): an outline OPENS a confirm, the tinted hold inside it confirms.
 */
export const DESTRUCTIVE_OUTLINE = 'border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive'

/**
 * A settings page's danger zone. Each row's button opens a dialog whose final
 * button is a hold (PUL-28 rulings, 14-10-2026: dialogs for every danger
 * zone, no inline reveals, no typed confirmations). Every confirmed action
 * waits 6 s behind the app's Undo bar before it is sent, which is what the
 * panel's line says.
 */
export function DangerZone({ items }: DangerZoneProps) {
  return (
    <SettingsPanel
      tone="danger"
      title="Danger zone"
      description="You can undo each of these for a few seconds. After that, it's permanent."
    >
      <PanelRows>
        {items.map((item) => (
          <PanelRow
            key={item.title}
            label={item.title}
            caption={item.description}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={item.onClick}
                disabled={item.disabled}
                aria-haspopup="dialog"
                className={DESTRUCTIVE_OUTLINE}
              >
                {item.buttonLabel}
              </Button>
            }
          />
        ))}
      </PanelRows>
    </SettingsPanel>
  )
}
