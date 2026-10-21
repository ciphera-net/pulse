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

  it('passes the true totals and filters to every list card', () => {
    // FOUR cards take totals — Sources (Referrers · Channels · Campaigns in
    // one card since 06-09-2026), Audience, TechSpecs and ContentStats.
    // ContentSignals carries no % by design, and Outbound stopped taking them
    // on 10-09-2026: its only use was the "N% of visitors left through a link"
    // footnote, which the owner had removed. A prop kept for a deleted sentence
    // is a denominator nobody divides by.
    expect(page.match(/totals=\{totals\}/g)?.length).toBe(4)
    // ContentStats, Sources, Audience, TechSpecs, Outbound, PeakHours all
    // thread the page's filters (Outbound to LABEL itself whole-site).
    expect(page.match(/filters=\{filtersParam \|\| undefined\}/g)?.length).toBe(6)
  })

  it('names each section, and says nothing else beside the name', () => {
    // Five headings. Outbound got its own on 10-09-2026 (owner: "add an
    // Outbound title like there is Audience on the left of it") — it used to
    // take its name from the header describing its neighbour.
    for (const title of ['Acquisition', 'Audience', 'Outbound', 'Content', 'Behaviour']) {
      expect(page).toContain(`<SectionHeader title="${title}" />`)
    }
    // 🔴 The provenance note is GONE (owner, same day: "get rid of whole site &
    // site timezone from on top right of all the blocks... its unnecessary").
    // It stated each section's filter scope on every load, whether or not
    // anything was filtered. The one card whose scope genuinely differs from its
    // neighbours is Outbound, whose endpoints take no filters — and that card
    // says so itself, in its own footnote, only when a filter is actually on.
    expect(page).not.toContain('note=')
    expect(page).not.toContain('sectionNote')
    expect(page).not.toContain("'filtered with the page'")
    expect(page).not.toContain('· site timezone')
  })

  // ── The Audience row carries a header PER COLUMN (owner, 10-09-2026) ───────
  // Technology and Outbound do not share a heading the way Sources/Locations
  // and Pages/Content-signals do: one is who visited, the other is where they
  // went. So "Audience" sits over the left card and "Outbound" over the right.
  it('gives the Audience row two headers, each inside its own grid cell', () => {
    // The row runs from the grid that OPENS it (the last one declared before the
    // Audience header — the header sits inside that grid, not above it) to the
    // Content header.
    const audienceAt = page.indexOf('<SectionHeader title="Audience"')
    const rowEnd = page.indexOf('<SectionHeader title="Content"')
    expect(audienceAt).toBeGreaterThan(-1)
    expect(rowEnd).toBeGreaterThan(audienceAt)
    const rowStart = page.lastIndexOf('grid gap-3 lg:grid-cols-2', audienceAt)
    expect(rowStart).toBeGreaterThan(-1)
    const row = page.slice(rowStart, rowEnd)
    expect(row).toContain('<SectionHeader title="Outbound" />')
    // TechSpecs and Outbound share exactly ONE grid — not two stacked sections.
    // Splitting them left both rows half empty, which the owner rejected on
    // staging.
    expect(row).toContain('<TechSpecs')
    expect(row).toContain('<Outbound')
    expect(row.match(/grid gap-3 lg:grid-cols-2/g)?.length ?? 0).toBe(1)

    // 🔴 Each header must sit INSIDE its grid cell. A separate two-title header
    // row would read correctly at desktop width and then, below `lg` where the
    // grid collapses to one column, stack both titles above both cards — every
    // title detached from the card it names. The cell wrapper is what prevents
    // that, and the card's `flex-1 min-h-0` box is what stops its own `h-full`
    // from overflowing the cell by the header's height.
    expect(row.match(/<div className="flex flex-col">/g)?.length ?? 0).toBe(2)
    expect(row.match(/<div className="flex-1 min-h-0">/g)?.length ?? 0).toBe(2)
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
  const share = read('components/surfaces/DashboardSurface.tsx')

  it('turns the full lists and drill-downs off, on all five cards, from the one flag', () => {
    // Five: Sources, Audience, TechSpecs, ContentStats plus ContentSignals (whose events
    // drill-down is not served to a share link). The flag is dashboardCapabilities().fullReads,
    // false only for a public-scoped read; the demo, served the full surface, keeps it on.
    expect(share.match(/memberFeatures=\{caps\.fullReads\}/g)?.length).toBe(5)
    // Four take totals — the Campaigns rows now live inside Sources.
    expect(share.match(/totals=\{totals\}/g)?.length).toBe(4)
    // The payload-rows prop is what keeps the campaigns endpoint unarmed on a share link —
    // remove it and the card starts fetching a route that link is not served.
    expect(share).toContain('campaigns={caps.fullReads ? undefined : (dashboard?.campaigns ?? [])}')
  })
})
