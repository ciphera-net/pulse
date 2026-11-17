import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import Sources from '@/components/dashboard/Sources'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import ContentStats from '@/components/dashboard/ContentStats'
import ContentSignals from '@/components/dashboard/ContentSignals'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'

// ─────────────────────────────────────────────────────────────────────────────
// A LIST NEVER DRAWS THE SAME ROW TWICE (lib/dashboard/sameRows.ts).
//
// Measured on production on 15-11-2026: the Campaigns tab's Source view drew "X" twice on one site, 68 visitors
// for the stored source `twitter` and 5 for `x`. The view grouped its rows by the stored value and labelled them
// by the brand, so one brand stood in the list once for every way it had been spelled. The Referrers tab beside
// it had always merged them. The same fault was open in every list that derives what a row reads from what is
// stored: a link without its scheme, a name with a capital, a locale as a language.
//
// Two halves, because either alone leaves a door open:
//   1. Every block is rendered with stored values that collide, and no two of its rows may read the same.
//   2. The SOURCE is read: every component that draws dimension rows is on the list below with how its rows stay
//      apart. A new block that is not on the list fails here, before it can draw a row twice.
//
// The mutations these tests kill: the Source view grouping by the stored value again; the merge taken out of the
// Outbound rows, Technology or Locations; a merged row filtering by one of its stored
// values only; a block that draws rows and is not listed.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  useFullDimensionList: vi.fn(),
  useCampaignsList: vi.fn(),
  usePagePreview: vi.fn(),
  useOutboundUrls: vi.fn(),
  useEventPropertyKeys: vi.fn(),
  useEventPropertyValues: vi.fn(),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...a: unknown[]) => h.useFullDimensionList(...a),
  useCampaignsList: (...a: unknown[]) => h.useCampaignsList(...a),
  usePagePreview: (...a: unknown[]) => h.usePagePreview(...a),
  useOutboundUrls: (...a: unknown[]) => h.useOutboundUrls(...a),
  useEventPropertyKeys: (...a: unknown[]) => h.useEventPropertyKeys(...a),
  useEventPropertyValues: (...a: unknown[]) => h.useEventPropertyValues(...a),
}))
vi.mock('@/lib/hooks/usePreloadImages', () => ({ usePreloadImages: () => {} }))
// Data behaviour, not motion: the cascade renders plain so no exit animation holds a row in jsdom.
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: () => <div data-testid="row-bar" />,
}))
vi.mock('@/components/dashboard/MapView', () => ({ default: () => <div data-testid="map-view" /> }))
vi.stubGlobal('IntersectionObserver', class {
  constructor(private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void) {}
  observe() { this.callback([{ isIntersecting: true }]) }
  unobserve() {}
  disconnect() {}
})

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const totals = { pageviews: 1000, visitors: 500 }
const dateRange = { start: '2026-10-16', end: '2026-11-14' }
const shared = { siteId: 'site-1', dateRange, totals }

beforeEach(() => {
  h.useFullDimensionList.mockReset().mockReturnValue(idle)
  h.useCampaignsList.mockReset().mockReturnValue(idle)
  h.usePagePreview.mockReset().mockReturnValue({ data: null })
  h.useOutboundUrls.mockReset().mockReturnValue(idle)
  h.useEventPropertyKeys.mockReset().mockReturnValue({ ...idle, data: [], available: true })
  h.useEventPropertyValues.mockReset().mockReturnValue({ ...idle, available: true })
})

const rows = () => [...document.querySelectorAll<HTMLElement>('.interactive-row')]
/** What a row reads: its text, and the mark beside it where the mark is a picture (a flag tells two cities apart). */
const label = (row: HTMLElement) => (row.querySelector('.truncate')?.textContent ?? '').trim()
const reads = (row: HTMLElement) => `${row.querySelector('img')?.getAttribute('src') ?? ''}|${label(row)}`
const drawn = () => rows().map(label)
function expectNoRowTwice() {
  const all = rows().map(reads)
  expect(all.length).toBeGreaterThan(0)
  expect(all.filter((r, i) => all.indexOf(r) !== i), `rows that read the same: ${JSON.stringify(drawn())}`).toEqual([])
}
const rowReading = (text: string) => {
  const found = rows().filter((row) => label(row) === text)
  expect(found, `rows reading "${text}" among ${JSON.stringify(drawn())}`).toHaveLength(1)
  return found[0]
}
const tab = (name: string) => fireEvent.click(screen.getByRole('radio', { name }))

describe('Sources', () => {
  const referrers = [
    { referrer: 'x.com', pageviews: 50, visitors: 40 },
    { referrer: 't.co', pageviews: 30, visitors: 25 },
    { referrer: 'linkedin.com', pageviews: 20, visitors: 18 },
    { referrer: 'Twitter', pageviews: 5, visitors: 5 },
    { referrer: 'LinkedIn', pageviews: 4, visitors: 3 },
  ]
  // The stored sources of the site the fault was measured on, with their visitors.
  const campaigns = [
    ['twitter', 68], ['uneed.best', 27], ['linkedin', 9], ['x', 5], ['europealternative.com', 4], ['chatgpt.com', 3], ['discord', 3],
  ].map(([source, visitors]) => ({ source, medium: 'social', campaign: 'launch', term: '', content: '', visitors, pageviews: visitors, bounce_rate: null, avg_duration: null }))

  it('Referrers: one row for a brand, as it always was', () => {
    render(<Sources referrers={referrers} {...shared} />)
    expectNoRowTwice()
    expect(drawn()).toEqual(['X', 'LinkedIn'])
    expect(rowReading('X').textContent).toContain('70')
  })

  it('Campaigns, Source: "X" once for twitter and x, with both counts (the fault measured on production)', () => {
    h.useCampaignsList.mockReturnValue({ ...idle, data: campaigns })
    render(<Sources referrers={referrers} {...shared} />)
    tab('Campaigns')
    expectNoRowTwice()
    expect(drawn()).toEqual(['X', 'Uneed', 'LinkedIn', 'Europealternative', 'ChatGPT', 'Discord'])
    expect(rowReading('X').textContent).toContain('73')
  })

  it('Campaigns, Source: a press on a merged row filters by every stored value it stands for', () => {
    h.useCampaignsList.mockReturnValue({ ...idle, data: campaigns })
    const onFilter = vi.fn()
    render(<Sources referrers={referrers} {...shared} onFilter={onFilter} />)
    tab('Campaigns')
    fireEvent.click(rowReading('X'))
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'utm_source', operator: 'is', values: ['twitter', 'x'] })
    fireEvent.click(rowReading('Uneed'))
    expect(onFilter).toHaveBeenLastCalledWith({ dimension: 'utm_source', operator: 'is', values: ['uneed.best'] })
  })

  it('Campaigns, Source, in the new frame: the same rows', () => {
    h.useCampaignsList.mockReturnValue({ ...idle, data: campaigns })
    render(<DashboardFrameProvider><Sources referrers={referrers} {...shared} /></DashboardFrameProvider>)
    fireEvent.click(screen.getAllByRole('radio')[2])
    expectNoRowTwice()
    expect(rowReading('X').textContent).toContain('73')
  })
})

describe('Locations', () => {
  const block = (over: Partial<React.ComponentProps<typeof Audience>> = {}) => (
    <Audience countries={[]} cities={[]} regions={[]} languages={[]} timezones={[]} {...shared} {...over} />
  )

  it('Countries: a country is drawn from its code, and every code reads as another country', () => {
    render(block({ countries: [{ country: 'US', pageviews: 40, visitors: 30 }, { country: 'BE', pageviews: 20, visitors: 12 }, { country: 'GB', pageviews: 4, visitors: 3 }] }))
    expectNoRowTwice()
    expect(drawn()).toEqual(['United States', 'Belgium', 'United Kingdom'])
  })

  it('Cities: one name in one country is one row; the same name under another flag is another city', () => {
    const onFilter = vi.fn()
    render(block({
      onFilter,
      cities: [
        // Two rows of one city under one flag, as a read grouped by region as well would answer them.
        { city: 'Springfield', country: 'US', pageviews: 9, visitors: 8 },
        { city: 'Springfield', country: 'US', pageviews: 4, visitors: 4 },
        { city: 'Springfield', country: 'CA', pageviews: 2, visitors: 2 },
        { city: 'Ghent', country: 'BE', pageviews: 1, visitors: 1 },
      ],
    }))
    tab('Cities')
    expectNoRowTwice()
    expect(drawn()).toEqual(['Springfield', 'Springfield', 'Ghent'])
    expect(rows()[0].textContent).toContain('12')
    fireEvent.click(rows()[0])
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'city', operator: 'is', values: ['Springfield'] })
  })

  it('Languages, by locale: two spellings of one locale are one row that filters by both', () => {
    const onFilter = vi.fn()
    render(block({
      onFilter,
      languages: [{ language: 'en-US', pageviews: 40, visitors: 30 }, { language: 'nl-BE', pageviews: 20, visitors: 12 }, { language: 'en-us', pageviews: 5, visitors: 4 }],
    }))
    tab('Languages')
    expectNoRowTwice()
    expect(drawn()).toEqual(['English (United States)', 'Dutch (Belgium)'])
    fireEvent.click(rowReading('English (United States)'))
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'language', operator: 'is', values: ['en-US', 'en-us'] })
  })

  it('Timezones: a zone is drawn with its own name, so two zones are two rows', () => {
    render(block({ timezones: [{ timezone: 'Europe/Brussels', pageviews: 9, visitors: 8 }, { timezone: 'Europe/Paris', pageviews: 4, visitors: 4 }] }))
    tab('Timezones')
    expectNoRowTwice()
    expect(rows()).toHaveLength(2)
  })
})

describe('Technology', () => {
  const block = (over: Partial<React.ComponentProps<typeof TechSpecs>> = {}) => (
    <TechSpecs browsers={[]} os={[]} devices={[]} screenResolutions={[]} {...shared} {...over} />
  )

  it('Browsers: a name stored with and without its capital is one browser', () => {
    render(block({ browsers: [{ browser: 'Chrome', pageviews: 50, visitors: 40 }, { browser: 'Safari', pageviews: 30, visitors: 20 }, { browser: 'chrome', pageviews: 4, visitors: 3 }] }))
    expectNoRowTwice()
    expect(drawn()).toEqual(['Chrome', 'Safari'])
    expect(rowReading('Chrome').textContent).toContain('43')
  })

  it('Devices: a merged row filters by every stored name', () => {
    const onFilter = vi.fn()
    render(block({ onFilter, devices: [{ device: 'desktop', pageviews: 50, visitors: 30 }, { device: 'mobile', pageviews: 30, visitors: 10 }, { device: 'Mobile', pageviews: 4, visitors: 2 }] }))
    tab('Devices')
    expectNoRowTwice()
    expect(drawn()).toEqual(['Desktop', 'Mobile'])
    fireEvent.click(rowReading('Mobile'))
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'device', operator: 'is', values: ['mobile', 'Mobile'] })
    fireEvent.click(rowReading('Desktop'))
    expect(onFilter).toHaveBeenLastCalledWith({ dimension: 'device', operator: 'is', values: ['desktop'] })
  })

  it('OS: a name that keeps its own capitals is drawn as stored, so it stays its own row', () => {
    render(block({ os: [{ os: 'iOS', pageviews: 9, visitors: 8 }, { os: 'macOS', pageviews: 4, visitors: 4 }, { os: 'Windows', pageviews: 2, visitors: 2 }] }))
    tab('OS')
    expectNoRowTwice()
    expect(drawn()).toEqual(['iOS', 'macOS', 'Windows'])
  })
})

describe('Outbound links', () => {
  const urls = [
    { value: 'https://www.shop.example/cart', count: 9 },
    { value: 'https://docs.example/start', count: 7 },
    { value: 'http://shop.example/cart', count: 2 },
    { value: 'https://shop.example/cart#pay', count: 5 },
  ]

  it('the Pages block\'s Outbound tab: links that read the same are one row with all their clicks', () => {
    h.useOutboundUrls.mockReturnValue({ ...idle, data: urls })
    render(
      <DashboardFrameProvider>
        <ContentStats topPages={[{ path: '/', pageviews: 9, visitors: 8, bounce_rate: null, avg_duration: null }]} entryPages={[]} exitPages={[]} domain="example.com" {...shared} outbound={{ period: '30d', goalCounts: [] }} />
      </DashboardFrameProvider>,
    )
    tab('Outbound')
    expectNoRowTwice()
    expect(drawn()).toEqual(['shop.example/cart', 'docs.example/start'])
    const merged = rowReading('shop.example/cart')
    expect(merged.textContent).toContain('16')
    // It opens its most clicked link.
    expect(merged.getAttribute('href')).toBe('https://www.shop.example/cart')
  })
})

describe('Events, in the new frame', () => {
  const block = (goalCounts: React.ComponentProps<typeof ContentSignals>['goalCounts']) => (
    <DashboardFrameProvider>
      <ContentSignals goalCounts={goalCounts} siteId="site-1" dateRange={dateRange} totals={totals} />
    </DashboardFrameProvider>
  )

  it('the list: two events whose names read the same stay two rows (a row is one event), each under its stored name', () => {
    render(block([
      { event_name: 'Signup', count: 9, visitors: 9 },
      { event_name: 'signup', count: 4, visitors: 4 },
      { event_name: 'purchase', count: 2, visitors: 2 },
    ]))
    expectNoRowTwice()
    expect(drawn()).toEqual(['Signup', 'signup', 'Purchase'])
  })

  it('the picked event\'s values: links that read the same are one row with all their events', () => {
    h.useEventPropertyKeys.mockReturnValue({ ...idle, data: [{ key: 'target', count: 20 }], available: true })
    h.useEventPropertyValues.mockReturnValue({
      ...idle,
      available: true,
      data: [
        { value: 'https://www.shop.example/cart', count: 9 },
        { value: 'https://docs.example/start', count: 7 },
        { value: 'http://shop.example/cart/', count: 4 },
      ],
    })
    render(block([{ event_name: 'cta_click', count: 20, visitors: 18 }]))
    const values = [...document.querySelectorAll<HTMLElement>('[data-event-value]')]
    const read = values.map(reads)
    expect(read.filter((r, i) => read.indexOf(r) !== i), `values that read the same: ${JSON.stringify(values.map(label))}`).toEqual([])
    expect(values.map(label)).toEqual(['shop.example/cart', 'docs.example/start'])
    expect(values[0].textContent).toContain('13')
  })
})

// ─── The source: every block that draws dimension rows says how its rows stay apart ───────────────────────────

const ROOT = process.cwd()

/** Every component that uses the dimension row, with the call that keeps its rows apart (or why none is needed). */
const HOW_ROWS_STAY_APART: Record<string, { by: string[] | null; why: string }> = {
  'components/dashboard/Sources.tsx': { by: ['mergeReferrersByDisplayName(', 'campaignViewRows('], why: 'Referrers merge by the name they draw; Campaigns by campaignViewRows; a channel is the server\'s own class.' },
  'components/dashboard/Locations.tsx': { by: ['mergeSameRows('], why: 'A row is its flag and its label.' },
  'components/dashboard/TechSpecs.tsx': { by: ['mergeSameRows('], why: 'A row is its name with a capital.' },
  'components/dashboard/OutboundLinksTab.tsx': { by: ['outboundLinkRows('], why: 'outboundLinkRows merges links that read the same.' },
  'components/dashboard/ContentStats.tsx': { by: null, why: 'A page is drawn as the path that is stored: the stored value is the row.' },
  'components/dashboard/GoalStats.tsx': { by: null, why: 'A row is one event. Its name is the event\'s, or the one its owner gave it: two events stay two rows.' },
  'components/dashboard/events/EventsBlock.tsx': { by: ['eventLabels('], why: 'A row is one event, so two are never merged: names that read alike each read their stored name instead.' },
  'components/dashboard/events/EventProperties.tsx': { by: ['propertyValueRows('], why: 'propertyValueRows merges values that read the same.' },
  'components/dashboard/MetricRowStat.tsx': { by: null, why: 'Defines the row and draws none.' },
  'components/pages/list/PagesList.tsx': { by: null, why: 'The Pages list: a page is drawn as the path that is stored, so the stored value is the row.' },
}

function components(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) components(rel, out)
    else if (rel.endsWith('.tsx')) out.push(rel)
  }
  return out
}

describe('the source: no block draws dimension rows without saying how they stay apart', () => {
  const users = components('components').filter((file) => readFileSync(join(ROOT, file), 'utf8').includes('DIMENSION_ROW')).sort()

  it('lists every component that draws dimension rows', () => {
    // A new block lands here. Add it to HOW_ROWS_STAY_APART with the call that merges its rows by what they read
    // (lib/dashboard/sameRows.ts), and to the rendered cases above with stored values that collide.
    expect(users).toEqual(Object.keys(HOW_ROWS_STAY_APART).sort())
  })

  it.each(Object.entries(HOW_ROWS_STAY_APART).filter(([, how]) => how.by !== null))('%s builds its rows through the merge', (file, how) => {
    const source = readFileSync(join(ROOT, file), 'utf8')
    for (const call of how.by as string[]) expect(source.includes(call), `${file} must call ${call} ${how.why}`).toBe(true)
  })

  it('the merge itself lives in one module, and the row builders use it', () => {
    for (const file of ['lib/dashboard/campaignRows.ts', 'lib/dashboard/outbound.ts', 'lib/dashboard/events.ts']) {
      expect(readFileSync(join(ROOT, file), 'utf8')).toContain("from '@/lib/dashboard/sameRows'")
    }
  })
})
