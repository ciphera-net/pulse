import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for wiring that no rendered assertion can defend cheaply
// (the Phase 1 F4 idiom): dropping a prop from the dashboard leaves every
// component test green while the page silently regresses. The page body is the
// dashboard SURFACE since PUL-34 Phase 2: the member's dashboard, the demo and a share
// link render this one file, so these pins hold for all three.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('dashboard page wiring (Phase 3)', () => {
  const page = read('components/surfaces/DashboardSurface.tsx')

  // The blocks' totals, filters and share-link diet are pinned where the blocks are drawn since 15-11-2026: the frame
  // (frame-wiring.test.ts). The surface's own arrangement, with its section titles and its two-header Audience row,
  // left on 16-11-2026.
  it('draws no section titles and no provenance note', () => {
    expect(page).not.toContain('SectionHeader')
    // 🔴 The provenance note is GONE (owner: "get rid of whole site & site timezone from on top right of all the
    // blocks... its unnecessary"). It stated each section's filter scope on every load, filtered or not.
    expect(page).not.toContain('note=')
    expect(page).not.toContain('sectionNote')
    expect(page).not.toContain("'filtered with the page'")
    expect(page).not.toContain('· site timezone')
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

describe('share link wiring (Phase 3)', () => {
  // The share page was its own component until PUL-34 Phase 2 (02-09-2026 it moved out of
  // the route so /demo could mount it). Now a share link renders the dashboard surface
  // itself, and what a public-scoped read is not served is switched off by ONE flag.
  // The blocks are the frame's (components/surfaces/DashboardFrame.tsx), which the surface mounts for every reader.
  const share = read('components/surfaces/DashboardFrame.tsx')

  it('turns the full lists and drill-downs off, on all five cards, from the one flag', () => {
    // Five: Sources, Audience, TechSpecs, ContentStats plus ContentSignals (whose events
    // drill-down is not served to a share link). The flag is dashboardCapabilities().fullReads,
    // false only for a public-scoped read; the demo, served the full surface, keeps it on.
    expect(share.match(/memberFeatures=\{caps\.fullReads\}/g)?.length).toBe(5)
    // Five take totals: the Campaigns rows live inside Sources, and the Events block's conversion divides by them.
    expect(share.match(/totals=\{totals\}/g)?.length).toBe(5)
    // The payload-rows prop is what keeps the campaigns endpoint unarmed on a share link —
    // remove it and the card starts fetching a route that link is not served.
    expect(share).toContain('campaigns={caps.fullReads ? undefined : (dashboard?.campaigns ?? [])}')
  })
})
