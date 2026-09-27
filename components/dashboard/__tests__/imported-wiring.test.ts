import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the imported-history wiring (PULSE-118, M11-h), the
// phase3-wiring idiom: dropping a prop from a page leaves every component test
// green while the page silently stops saying where its numbers came from.
// Dashboard option 2 renders wherever CommandDeck does: the member dashboard
// AND the share view.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('imported-history wiring', () => {
  const page = read('app/sites/[id]/page.tsx')
  const share = read('components/share/PublicDashboard.tsx')

  it('hands the deck the current and the comparison period\'s provenance on the member dashboard', () => {
    expect(page).toContain('imported={dashboard?.imported}')
    expect(page).toContain('prevImported={prevStats?.imported}')
  })

  it('hands the deck the provenance on the share view (no comparison period there)', () => {
    expect(share).toContain('imported={data?.imported}')
  })

  it('hands every importable card its provenance, on both surfaces', () => {
    expect(page.match(/importedCards=\{dashboard\?\.imported_cards\}/g)?.length).toBe(4)
    expect(share.match(/importedCards=\{data\?\.imported_cards\}/g)?.length).toBe(4)
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
