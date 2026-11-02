'use client'

import { Toggle } from '@ciphera-net/facet'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

/**
 * The team's beta-features switch (Settings → Beta): a panel, one row, Facet's Toggle, drawn as
 * AccountSecurityAlertsPanel draws its switches. WorkspaceBetaTab owns the state and the save.
 */
export function BetaFeaturesPanel({
  on,
  canEdit,
  saving,
  onToggle,
  inBeta,
}: {
  on: boolean
  canEdit: boolean
  saving: boolean
  onToggle: () => void
  inBeta: readonly string[]
}) {
  // Each sentence carries its own full stop.
  const sentences = [
    inBeta.length > 0 ? `Now in beta: ${inBeta.join(', ')}.` : null,
    canEdit ? null : 'Only the owner or an admin can change this.',
  ].filter(Boolean)
  return (
    <SettingsPanel
      title="Beta features"
      description="Try new features before they're released to everyone. We may still change or remove them."
    >
      <PanelRows>
        <PanelRow
          label="Show beta features"
          caption={sentences.length > 0 ? sentences.join(' ') : undefined}
          control={
            <Toggle
              checked={on}
              onChange={() => onToggle()}
              disabled={!canEdit || saving}
              aria-label="Show beta features"
            />
          }
        />
      </PanelRows>
    </SettingsPanel>
  )
}
