'use client'
import { Button } from '@ciphera-net/facet'
import { PanelRow, PanelRows } from '@/components/settings/panels'
import type { Preferences } from '@/lib/api/notifications-preferences'

interface Props {
  prefs: Preferences
  onChange: (next: Preferences) => void
}

// Native time inputs, Input-styled + dark color-scheme so the OS never renders
// a light picker (spec §2.3). Content-sized, not stretched.
const timeInputClass =
  'h-9 rounded-none border border-input bg-transparent px-3 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [color-scheme:dark]'

export default function QuietHoursSection({ prefs, onChange }: Props) {
  const hasWindow = Boolean(prefs.quiet_hours_start || prefs.quiet_hours_end)
  return (
    <PanelRows>
      <PanelRow label="Window">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="time"
            className={timeInputClass}
            value={prefs.quiet_hours_start ?? ''}
            onChange={e => onChange({ ...prefs, quiet_hours_start: e.target.value || null })}
            aria-label="Quiet hours start"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="time"
            className={timeInputClass}
            value={prefs.quiet_hours_end ?? ''}
            onChange={e => onChange({ ...prefs, quiet_hours_end: e.target.value || null })}
            aria-label="Quiet hours end"
          />
          {hasWindow && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...prefs, quiet_hours_start: null, quiet_hours_end: null })}
            >
              Clear
            </Button>
          )}
        </div>
      </PanelRow>
    </PanelRows>
  )
}
