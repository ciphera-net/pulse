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
    // Four cards take totals — Sources (Referrers · Channels · Campaigns in
    // one card since 06-09-2026), Audience, TechSpecs, ContentStats;
    // ContentSignals carries no % by design.
    expect(page.match(/totals=\{totals\}/g)?.length).toBe(4)
    // ContentStats, Sources, Audience, TechSpecs, PeakHours all thread the
    // page's filters.
    expect(page.match(/filters=\{filtersParam \|\| undefined\}/g)?.length).toBe(5)
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

  it('keeps the blocks decoupled — no metric prop reaches any card (01-09-2026)', () => {
    expect(page).not.toContain('blockMetric')
    expect(page).not.toContain('pageMetric')
    expect(page).not.toContain('useEngagementPercentiles')
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

  it('draws curveLinear — the sharp-chart pick (01-09-2026) supersedes the 21-08 monotone call', () => {
    // The owner picked the sharp instrument on mocks of their own data
    // (artifact "The Sharp Line", three rounds). Reverting to monotone again
    // is a deliberate decision, not a drive-by.
    expect(deck).toContain('curve={curveLinear}')
    expect(deck).toContain('dashedTailFrom=')
    expect(deck).toContain('fadeStrokeEdges={false}')
  })
})

describe('share page wiring (Phase 3)', () => {
  // The view moved out of the page on 02-09-2026 so /demo mounts the same
  // surface — the wiring contract travels with the component, not the route.
  const share = read('components/share/PublicDashboard.tsx')

  it('passes totals to all five cards and disables view-all (member-only endpoints)', () => {
    // Five: Sources, Audience, TechSpecs, ContentStats plus ContentSignals
    // (whose page-preview + events drill-down are member-only).
    expect(share.match(/memberFeatures=\{false\}/g)?.length).toBe(5)
    // Four take totals — the Campaigns rows now live inside Sources.
    expect(share.match(/totals=\{totals\}/g)?.length).toBe(4)
    // The payload-rows prop is what keeps the campaigns member-only endpoint
    // unarmed on the share surface — remove it and the card starts fetching.
    expect(share).toContain('campaigns={data?.campaigns ?? []}')
  })
})
