import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for wiring that no rendered assertion can defend cheaply
// (the Phase 1 F4 idiom): dropping a prop from page.tsx leaves every
// component test green while the page silently regresses.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('dashboard page wiring (Phase 3)', () => {
  const page = read('app/sites/[id]/page.tsx')

  it('passes the true totals and filters to every list card', () => {
    // Five cards take totals (incl. Campaigns, whose unit is visitors);
    // ContentSignals carries no % by design.
    expect(page.match(/totals=\{totals\}/g)?.length).toBe(5)
    // ContentStats, TopReferrers, Audience, TechSpecs, Campaigns, PeakHours
    // all thread the page's filters.
    expect(page.match(/filters=\{filtersParam \|\| undefined\}/g)?.length).toBe(6)
  })

  it('labels each section with its filter scope, and Behaviour with the timezone', () => {
    // Scope only, NO unit word — the cards state their own unit ("share of
    // N pageviews/visitors"); a unit here contradicted them (review finding).
    expect(page).toContain("'filtered with the page'")
    expect(page).toContain("'whole site'")
    expect(page).not.toContain("'events · whole site'")
    expect(page).toContain('· site timezone')
    for (const title of ['Acquisition', 'Audience', 'Content', 'Behaviour']) {
      expect(page).toContain(`<SectionHeader title="${title}"`)
    }
  })

  it('passes the engagement error and filter state to the deck', () => {
    expect(page).toContain('engagementError={Boolean(engagementError)}')
    expect(page).toContain('filtersActive={hasFilters}')
  })

  it('carries no provenance strip — removed by owner decision 19-08', () => {
    expect(page).not.toContain('DashboardStatusLine')
  })
})

describe('command deck chart (approved C mockup fidelity)', () => {
  const deck = read('components/dashboard/CommandDeck.tsx')

  it('fills the deck height instead of deriving height from width', () => {
    expect(deck).toContain('fillParent')
    expect(deck).not.toContain('aspectRatio="2.9 / 1"')
  })

  it('draws the shared monotone curve — the sharp C-mockup line was reverted 21-08-2026', () => {
    // No curve override at all: the Area default is curveMonotoneX, like every
    // other chart surface. Overriding it again is a deliberate decision, not a
    // drive-by.
    expect(deck).not.toContain('curve={')
  })
})

describe('share page wiring (Phase 3)', () => {
  const share = read('app/share/[id]/page.tsx')

  it('passes totals to all four cards and disables view-all (member-only endpoints)', () => {
    expect(share.match(/memberFeatures=\{false\}/g)?.length).toBe(4)
    expect(share.match(/totals=\{data \? \{ pageviews: data\.stats\.pageviews/g)?.length).toBe(4)
  })
})
