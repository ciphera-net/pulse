'use client'

import { SegmentedControl, toast } from '@ciphera-net/facet'
import { Monitor } from '@phosphor-icons/react'
import { usePreferences, type TimeDisplay } from '@/lib/hooks/usePreferences'
import ThemePicker from '@/components/theme/ThemePicker'
import { KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'

// Labels decided 18-09-2026 ("Site time" was not understood). Values are the wire modes (migration 188).
const TIME_DISPLAY_OPTIONS: { value: TimeDisplay; label: string }[] = [
  { value: 'site', label: "Site's timezone" },
  { value: 'local', label: 'My timezone' },
  { value: 'utc', label: 'UTC' },
]

/** Display: both settings save at once, to the account, so every device follows (R2 keeps the theme cards). */
export default function DisplaySection() {
  const { timeDisplay, setTimeDisplay, loaded } = usePreferences()
  return (
    <KitSection title="Display" description="How Pulse looks and shows times to you, on every device." icon={<Monitor />}>
      <KitRows>
        <KitRow
          label="Show times in"
          caption="Changes only how times show to you. Daily totals always follow each site's timezone, set on General."
        >
          <SegmentedControl
            aria-label="Show times in"
            value={timeDisplay}
            disabled={!loaded}
            onChange={(v: string) => {
              void setTimeDisplay(v as TimeDisplay).then((ok) => {
                if (!ok) toast.error("Couldn't save how times are shown. Nothing changed.")
              })
            }}
            options={TIME_DISPLAY_OPTIONS}
          />
        </KitRow>
        <KitRow label="Theme" caption="Saved to your account, so every device you sign in on uses it.">
          <ThemePicker />
        </KitRow>
      </KitRows>
    </KitSection>
  )
}
