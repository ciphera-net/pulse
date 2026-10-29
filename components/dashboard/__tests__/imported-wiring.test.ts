import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the imported-history wiring (PULSE-118, M11-h), the
// phase3-wiring idiom: dropping a prop from a page leaves every component test
// green while the page silently stops saying where its numbers came from.
// Dashboard option 2 renders wherever CommandDeck does: the member dashboard, the
// demo AND the share view — one surface since PUL-34 Phase 2, so one file to pin.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('imported-history wiring', () => {
  const page = read('components/surfaces/DashboardSurface.tsx')

  it('hands the deck the current and the comparison period\'s provenance (a share link has no comparison period: prevStats is absent there)', () => {
    expect(page).toContain('imported={dashboard?.imported}')
    expect(page).toContain('prevImported={prevStats?.imported}')
  })

  it('hands every importable card its provenance, on every scope', () => {
    expect(page.match(/importedCards=\{dashboard\?\.imported_cards\}/g)?.length).toBe(4)
  })

  // M12-f: the goal counts' provenance is its own field on the bundle
  // (`imported_goals`, not an `imported_cards` key). The Events card reads it
  // everywhere; Outbound, where it renders (not on a share link, which is not served
  // its two lists).
  it('hands the Events and Outbound cards the goal counts\' provenance (M12)', () => {
    expect(page.match(/goalsImported=\{dashboard\?\.imported_goals\}/g)?.length).toBe(2)
  })

  it('notes a filtered view beside the Filter button, from the response, with the imported_history glyph', () => {
    const note = page.indexOf('importLeftOutByFilter(dashboard?.imported)')
    const filterButton = page.indexOf('<FilterButton')
    expect(note).toBeGreaterThan(-1)
    expect(note).toBeLessThan(filterButton)
    expect(page.slice(note, filterButton)).toContain('Pulse-measured days only')
    expect(page.slice(note, filterButton)).toContain('<TermInfoTip term="imported_history" />')
  })
})
