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

// The site pages' bodies are surface components since PUL-34 Phase 2 (each app/sites/[id]/**/page.tsx renders one), so
// the pins read the surfaces. The dashboard's own pins live in dashboard-surface-wiring.test.ts; the share page they
// also pinned is the dashboard surface in scoped mode now (app/sites/[id]/__tests__/dashboard-scopes.test.tsx).
const SWITCHER_PAGES: Record<string, string> = {
  dashboard: 'components/surfaces/DashboardSurface.tsx',
  pages: 'components/surfaces/PagesSurface.tsx',
  visitors: 'app/sites/[id]/visitors/page.tsx',
  'visitors (detail)': 'app/sites/[id]/visitors/[key]/page.tsx',
  funnels: 'components/surfaces/FunnelsSurface.tsx',
  'funnels (detail)': 'components/surfaces/FunnelDetailSurface.tsx',
  journeys: 'components/surfaces/JourneysSurface.tsx',
  search: 'components/surfaces/SearchSurface.tsx',
  cdn: 'components/surfaces/CdnSurface.tsx',
  uptime: 'components/surfaces/UptimeSurface.tsx',
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

describe('the top bar', () => {
  it('says when the page last refreshed, never "Live ·"', () => {
    const shell = read('components/dashboard/DashboardShell.tsx')
    expect(shell).toContain('formatUpdatedLabel(lastUpdatedAt)')
    expect(shell).not.toMatch(/Live ·/)
  })
})
