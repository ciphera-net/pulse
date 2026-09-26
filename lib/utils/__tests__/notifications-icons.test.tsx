import { describe, it, expect } from 'vitest'
import { Lightning } from '@phosphor-icons/react'
import { getTypeIcon } from '@/lib/utils/notifications'
import { NOTIFICATION_TYPES } from '@/lib/notifications/types'

// PULSE-72: `getTypeIcon`'s map used to be `Record<string, ReactElement>`, so
// a notification type with no entry compiled clean and rendered the Lightning
// fallback forever — which is exactly how site_install_silent,
// site_install_recovered and site_events_rejected shipped with no icon. The
// map now closes with `satisfies Record<NotificationType, ReactElement>`
// (a build-time check), and this test is the run-time twin of that check: it
// walks NOTIFICATION_TYPES, the same runtime list the map is checked against,
// so a future type added to the union without an icon here fails a test even
// under a runner that does not type-check.
describe('getTypeIcon (PULSE-72)', () => {
  it('renders a real icon, never the Lightning fallback, for every declared notification type', () => {
    for (const type of NOTIFICATION_TYPES) {
      const icon = getTypeIcon(type)
      expect(icon, `${type} produced no icon`).toBeTruthy()
      expect(icon.type, `${type} fell back to the Lightning icon`).not.toBe(Lightning)
    }
  })

  it('falls back to the Lightning icon for a type the union does not declare', () => {
    const icon = getTypeIcon('not_a_real_notification_type')
    expect(icon.type).toBe(Lightning)
  })
})
