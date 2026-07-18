'use client'

import { Button } from '@ciphera-net/facet'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

interface DangerZoneItem {
  title: string
  description: string
  buttonLabel: string
  /**
   * Which weight the row's entry button carries:
   * - `'outline'` = neutral outline (the less-final action — Transfer, Reset Data)
   * - `'solid'`   = destructive outline in coral (the final/irreversible action — Delete)
   *
   * Note: `'solid'` no longer paints a filled red button. Per the color
   * discipline (spec §2.3) solid destructive fill is reserved for the final
   * confirm button inside a reveal/dialog; the danger-row entry buttons are
   * always outlines. The prop name is kept for API compatibility with the three
   * tabs that consume this component.
   */
  variant: 'outline' | 'solid'
  onClick: () => void
  disabled?: boolean
}

interface DangerZoneProps {
  items: DangerZoneItem[]
  children?: React.ReactNode
}

export function DangerZone({ items, children }: DangerZoneProps) {
  return (
    <SettingsPanel tone="danger" kicker="Danger zone" description="Irreversible actions.">
      <PanelRows>
        {items.map((item) => (
          <PanelRow
            key={item.title}
            label={item.title}
            caption={item.description}
            control={
              <Button
                variant="secondary"
                size="sm"
                onClick={item.onClick}
                disabled={item.disabled}
                className={
                  item.variant === 'solid'
                    ? 'border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10'
                    : undefined
                }
              >
                {item.buttonLabel}
              </Button>
            }
          />
        ))}
      </PanelRows>

      {/* Reveal blocks (typed-DELETE / transfer pickers) dock inside the danger
          frame, ruled off from the rows above. Only Workspace·General passes
          children today; Site·General and Account·Profile drive their confirms
          through modals / sibling blocks and pass none. */}
      {children && <div className="border-t border-destructive/30">{children}</div>}
    </SettingsPanel>
  )
}
