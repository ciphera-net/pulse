import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the dashboard SURFACE's wiring (PUL-34 Phase 2), in the Phase 1 F4
// idiom (phase3-wiring.test.ts): props and arguments no component test can see — dropping
// one leaves every suite green while a page quietly fetches the wrong thing. Comments are
// stripped first, so a sentence ABOUT the wiring can never satisfy a pin meant for the code.
//
// The dashboard pins that used to live in view-switcher-wiring.test.ts ("the dashboard")
// moved here when the page body became a surface that the member's dashboard, the demo and a
// share link all render; the share page's two pins ("the share page") now hold of the
// surface's scoped branch. The behaviour is in dashboard-scopes.test.tsx; these are the
// seams that test cannot see.
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const SURFACE = 'components/surfaces/DashboardSurface.tsx'

describe('the dashboard surface: the range and the live window', () => {
  const page = read(SURFACE)

  it('sends All time to the filter suggestions as the token, never as the window\'s dates', () => {
    // Found by the 26-09 review: the suggestions fetch alone sent dates, which 400
    // once a window passes 366 days (Funnels and Journeys already sent the token).
    // PULSE-192: and in realtime mode the live window rides along, so the suggestions
    // describe the five minutes the page shows rather than the calendar day.
    expect(page).toMatch(/useFilterSuggestions\(\s*siteId,\s*resolvedDateRange,\s*filtersParam \|\| undefined,\s*serverResolvedPeriod\(periodReady, period\),\s*liveMinutes,?\s*\)/)
  })

  it('every list a card fetches on its own gets the live window, and refreshes on the live signal (PULSE-192)', () => {
    for (const card of ['Sources', 'Audience', 'TechSpecs', 'Outbound', 'ContentStats', 'ContentSignals']) {
      const start = page.indexOf(`<${card}\n`)
      expect(start, card).toBeGreaterThan(-1)
      expect(page.slice(start, page.indexOf('/>', start)), card).toContain('liveMinutes={liveMinutes}')
    }
    // The matcher finds a site's live lists whichever way their keys were written: a
    // member's carry the id, a public read's carry `public:<id>`.
    expect(page).toContain('void mutateLiveLists(liveListKeyMatcher(siteId))')
  })

  it('draws no previous-period comparison for All time, for realtime or for a share link', () => {
    // Realtime's live window is echoed as the day it falls in, so the "previous
    // period" was all of yesterday — a five-minute count against a whole day. A share
    // link's previous window is a read over arbitrary dates, which it is refused.
    expect(page).toMatch(/caps\.comparison && resolvedDateRange && period !== 'all' && !isLive \? previousDateRange\(resolvedDateRange\) : null/)
  })

  it('the orb is the one way into realtime, and leaving goes through the shared toggle', () => {
    expect(page).toContain('useRealtimeToggle(urlRange)')
    expect(page).toMatch(/<RealtimeOrb count=\{realtime\} live=\{isLive\} onToggle=\{toggleRealtime\} \/>/)
  })

  it('shows the orb for display only where realtime is not a mode (a share link)', () => {
    expect(page).toMatch(/caps\.realtimeMode \? \(\s*<RealtimeOrb count=\{realtime\} live=\{isLive\} onToggle=\{toggleRealtime\} \/>\s*\) : \(\s*<RealtimeOrb count=\{realtime\} \/>\s*\)/)
  })

  it('declares the realtime mode to the range hook only where it exists', () => {
    expect(page).toContain('modes: caps.realtimeMode ? REALTIME_MODES : undefined')
    expect(page).toContain('rollingMinutes: caps.realtimeMode ? REALTIME_ROLLING_MINUTES : undefined')
  })
})

describe('the dashboard surface: what only a member gets', () => {
  const page = read(SURFACE)

  it('reads the site from its scope, never from the path', () => {
    expect(page).toContain('useSiteScope()')
    expect(page).not.toContain('useParams')
    expect(page).not.toContain('usePathname')
  })

  it('mounts the tour and the install banner for a member only', () => {
    expect(page).toMatch(/\{caps\.member && <TourController \/>\}/)
    expect(page).toMatch(/\{caps\.member && <InstallBanner siteId=\{siteId\} \/>\}/)
  })

  it('never opens the realtime socket itself: a member\'s page mounts it, a public page polls', () => {
    expect(page).not.toContain('useRealtimeSync')
    expect(page).toMatch(/caps\.member\s*\?\s*<SocketLiveSync siteId=\{siteId\} onChanged=\{refreshLive\} \/>\s*:\s*<PollLiveSync onChanged=\{refreshLive\} \/>/)
  })

  it('tells the hero the page has drawn once, only where a public page can be framed', () => {
    expect(page).toContain('if (!caps.embedReady || !dashboardDrawn || embedAnnounced.current) return')
    expect(page).toContain('postEmbedReady()')
  })
})

describe('the dashboard surface: what a share link is refused is not asked for', () => {
  const page = read(SURFACE)

  it('reads no site record and no data window under a scope that is not served them', () => {
    expect(page).toContain('caps.siteRecord')
    expect(page).toMatch(/<SiteDashboard scope=\{scope\} caps=\{caps\} facts=\{null\} \/>/)
  })

  it('names no date to the dashboard read, and asks for day buckets', () => {
    expect(page).toContain('const datedRead = periodReady && caps.explicitDates')
    expect(page).toMatch(/const interval = !caps\.hourlyBuckets \? 'day' :/)
  })

  it('reads no filter from the URL', () => {
    expect(page).toContain("const raw = caps.filters ? searchParams.get('filters') : null")
  })

  it('hands no card a way to filter, and the cards the full lists only where they are served', () => {
    expect(page).toContain('const onCardFilter = caps.filters ? handleAddFilter : undefined')
    expect(page).not.toMatch(/onFilter=\{handleAddFilter\}/)
    // Sources, Audience, TechSpecs, ContentStats, ContentSignals.
    expect(page.match(/memberFeatures=\{caps\.fullReads\}/g)?.length).toBe(5)
  })

  it('draws the sections a share link is served, and only those', () => {
    expect(page).toMatch(/\{caps\.fullReads && \(\s*<div className="flex flex-col">\s*<SectionHeader title="Outbound" \/>/)
    expect(page).toMatch(/\{!isLive && caps\.hourlyBuckets && \(<>\s*<SectionHeader title="Behaviour" \/>/)
  })

  it('offers the filter builder, its pills and its button where filtering is served', () => {
    expect(page.match(/caps\.filters && \(/g)?.length).toBe(3)
    expect(page.match(/<FilterBuilder/g)?.length).toBe(2)
  })
})
