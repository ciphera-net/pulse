import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the view switcher's page wiring (PULSE-20 / PULSE-65), in the
// Phase 1 F4 idiom (phase3-wiring.test.ts): these are props and arguments that no
// component test can see — dropping one leaves every suite green while a page quietly
// fetches the wrong thing. Comments are stripped first, so a sentence ABOUT the wiring
// can never satisfy a pin meant for the code.
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const SWITCHER_PAGES: Record<string, string> = {
  dashboard: 'app/sites/[id]/page.tsx',
  pages: 'app/sites/[id]/pages/page.tsx',
  visitors: 'app/sites/[id]/visitors/page.tsx',
  'visitors (detail)': 'app/sites/[id]/visitors/[key]/page.tsx',
  funnels: 'app/sites/[id]/funnels/page.tsx',
  'funnels (detail)': 'app/sites/[id]/funnels/[funnelId]/page.tsx',
  journeys: 'app/sites/[id]/journeys/page.tsx',
  search: 'app/sites/[id]/search/page.tsx',
  cdn: 'app/sites/[id]/cdn/page.tsx',
  uptime: 'app/sites/[id]/uptime/page.tsx',
}

describe('every switcher page renders the one menu from the one hook', () => {
  for (const [name, file] of Object.entries(SWITCHER_PAGES)) {
    it(`${name}: spreads the hook's picker, declares no vocabulary of its own`, () => {
      const src = read(file)
      expect(src).toMatch(/<DateRangePicker \{\.\.\.(\w+\.)?picker\} \/>/)
      expect(src).toMatch(/useUrlDateRange\(\{\s*surface:/)
      for (const removed of ['extraPresets', 'exclusive:', 'excludePresets', 'presetsOnly', 'pageKey', 'pickerProps']) {
        expect(src).not.toContain(removed)
      }
    })
  }

  it('CDN answers on the UTC wall clock — its days are Bunny\'s UTC days', () => {
    expect(read(SWITCHER_PAGES.cdn)).toMatch(/timezone:\s*'UTC'/)
  })
})

describe('the dashboard', () => {
  const page = read('app/sites/[id]/page.tsx')

  it('sends All time to the filter suggestions as the token, never as the window\'s dates', () => {
    // Found by the 26-09 review: the suggestions fetch alone sent dates, which 400
    // once a window passes 366 days (Funnels and Journeys already sent the token).
    expect(page).toMatch(/useFilterSuggestions\(\s*siteId,\s*resolvedDateRange,\s*filtersParam \|\| undefined,\s*serverResolvedPeriod\(periodReady, period\),?\s*\)/)
  })

  it('draws no previous-period comparison for All time or for realtime', () => {
    // Realtime's live window is echoed as the day it falls in, so the "previous
    // period" was all of yesterday — a five-minute count against a whole day.
    expect(page).toMatch(/resolvedDateRange && period !== 'all' && !isLive \? previousDateRange\(resolvedDateRange\) : null/)
  })

  it('the orb is the one way into realtime, and leaving goes through the shared toggle', () => {
    expect(page).toContain('useRealtimeToggle(urlRange)')
    expect(page).toMatch(/<RealtimeOrb count=\{realtime\} live=\{isLive\} onToggle=\{toggleRealtime\} \/>/)
  })
})

describe('Visitors', () => {
  const page = read('app/sites/[id]/visitors/page.tsx')

  it('puts the orb directly before the switcher (approved mock d1-visitors)', () => {
    expect(page).toMatch(/<RealtimeOrb [^>]*onToggle=\{toolbar\.onToggleLive\} \/>\s*<DateRangePicker \{\.\.\.toolbar\.picker\} \/>/)
  })

  it('is on the realtime mode, and sends All time as the token', () => {
    expect(page).toContain('modes: REALTIME_MODES')
    expect(page).toContain('rollingMinutes: REALTIME_ROLLING_MINUTES')
    expect(page).toContain('serverResolvedPeriod(periodReady, period)')
  })
})

describe('the share page', () => {
  const page = read('components/share/PublicDashboard.tsx')

  it('shows the orb for display only and never touches the view memory', () => {
    expect(page).toMatch(/<RealtimeOrb count=\{realtime_visitors\} \/>/)
    expect(page).not.toContain('useUrlDateRange')
    expect(page).not.toContain('pulse_view')
  })

  it('offers no custom range and no arrows', () => {
    const picker = page.slice(page.indexOf('<DateRangePicker'), page.indexOf('/>', page.indexOf('<DateRangePicker')))
    expect(picker).toContain('rows={shareRows()}')
    expect(picker).not.toContain('onCustom')
    expect(picker).not.toContain('onShift')
  })
})

describe('the top bar', () => {
  it('says when the page last refreshed, never "Live ·"', () => {
    const shell = read('components/dashboard/DashboardShell.tsx')
    expect(shell).toContain('formatUpdatedLabel(lastUpdatedAt)')
    expect(shell).not.toMatch(/Live ·/)
  })
})
