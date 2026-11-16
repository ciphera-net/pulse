import { describe, expect, it } from 'vitest'
import { SITE_KEY_MAP } from '@/components/keyboard/ShortcutHandler'
import { NAVIGATION } from '@/components/keyboard/ShortcutsOverlay'

// The overlay's navigation list is written by hand beside ShortcutHandler's table. From 22-09 to 16-11-2026 it said
// `g p` for Performance, after `g p` had moved to Pages and Performance to `g r`. This reads both.
const LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  pages: 'Pages',
  journeys: 'Journeys',
  visitors: 'Visitors',
  funnels: 'Funnels',
  search: 'Search',
  cdn: 'CDN',
  uptime: 'Uptime',
  pagespeed: 'Performance',
}

describe('the ? overlay and the g shortcuts', () => {
  it('names every site page under the key that goes there', () => {
    for (const [key, page] of Object.entries(SITE_KEY_MAP)) {
      const row = NAVIGATION.find((r) => r.keys[0] === 'g' && r.keys[1] === key)
      expect(row, `g ${key}`).toBeDefined()
      expect(row!.label, `g ${key}`).toBe(LABEL[page])
    }
  })

  it('lists no site page key the handler does not have', () => {
    for (const row of NAVIGATION) {
      if (row.keys[1] === 'h' || row.keys[1] === 'i') continue
      expect(SITE_KEY_MAP[row.keys[1]], row.label).toBeDefined()
    }
  })
})
