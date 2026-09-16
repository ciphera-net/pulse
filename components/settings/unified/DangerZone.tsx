'use client'

import { Button } from '@ciphera-net/facet'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

interface DangerZoneItem {
  title: string
  description: string
  buttonLabel: string
  /**
   * Which weight the row's entry button carries:
   * - `'outline'` = the plain outline rung (the less-final action — Transfer, Reset data)
   * - `'solid'`   = the destructive OUTLINE in coral (the final/irreversible action — Delete)
   *
   * `'solid'` does not paint a filled red button. The destructive fill is
   * reserved for the final confirm inside a dialog; danger-row entry buttons
   * are always outlines. The prop name is kept for API compatibility with the
   * tabs that consume this component.
   */
  variant: 'outline' | 'solid'
  onClick: () => void
  disabled?: boolean
  /**
   * When the row's button opens a reveal block below the rows (a typed-DELETE
   * form, a transfer picker), pass whether it is open so the button reads as
   * the disclosure it is.
   */
  expanded?: boolean
}

interface DangerZoneProps {
  items: DangerZoneItem[]
  children?: React.ReactNode
}

/** The destructive-outline rung of the button ladder, shared with any danger row. */
export const DESTRUCTIVE_OUTLINE = 'border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive'

export function DangerZone({ items, children }: DangerZoneProps) {
  return (
    <SettingsPanel tone="danger" title="Danger zone" description="These cannot be undone.">
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
                aria-expanded={item.expanded}
                className={item.variant === 'solid' ? DESTRUCTIVE_OUTLINE : undefined}
              >
                {item.buttonLabel}
              </Button>
            }
          />
        ))}
      </PanelRows>

      {/* Reveal blocks (typed-DELETE / transfer pickers) dock inside the danger
          frame, ruled off from the rows above. */}
      {children && <div className="border-t border-destructive/30">{children}</div>}
    </SettingsPanel>
  )
}
