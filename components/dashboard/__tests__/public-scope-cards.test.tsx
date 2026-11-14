// PUL-34 Phase 2 — no card says "go to your settings" to somebody who has none.
//
// In a public view (the demo, a share link) the reader is not the site's owner and has no
// account: an empty card must not offer to install a script, link to settings or Visitors,
// or speak to the owner. This renders the REAL cards, empty, under each scope, walks every
// tab of every card, and reads what a reader could click or read. A card added later that
// puts a link in its empty state fails here, because the rule lives in one place
// (components/dashboard/CardEmptyState.tsx) and this is what holds the cards to it.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CommandDeck from '@/components/dashboard/CommandDeck'
import Sources from '@/components/dashboard/Sources'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import ContentStats from '@/components/dashboard/ContentStats'
import ContentSignals from '@/components/dashboard/ContentSignals'
import Outbound from '@/components/dashboard/Outbound'
import CardEmptyState from '@/components/dashboard/CardEmptyState'
import { SiteScopeProvider, memberScope, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'

const h = vi.hoisted(() => ({
  idle: { data: undefined, error: undefined, isLoading: false, mutate: () => {} },
  outbound: { data: { urls: [], paths: [] }, error: undefined, isLoading: false, mutate: () => {} },
  usePagePreview: vi.fn(),
}))
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: () => h.idle,
  useCampaignsList: () => h.idle,
  useOutboundLinks: () => h.outbound,
  usePagePreview: (...a: unknown[]) => h.usePagePreview(...a),
}))
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: () => null,
}))
vi.mock('@/components/dashboard/MapView', () => ({ default: () => null }))
vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value, format }: { value: number; format: (v: number) => string }) => <span>{format(value)}</span>,
}))
vi.mock('@/components/ui/area-chart', () => {
  const Nothing = () => null
  return { AreaChart: Nothing, Area: Nothing, Grid: Nothing, XAxis: Nothing, YAxis: Nothing, ChartTooltip: Nothing, ReferenceLine: Nothing }
})
vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

const demoScope: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
const shareScope: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/share/site-1', pages: ['dashboard'], demo: false, fidelity: 'scoped' }

const range = { start: '2026-09-21', end: '2026-10-20' }
const noop = () => {}

/**
 * `live` is realtime mode, handed to each card the way the surface hands it: the flag to the blocks, the window's
 * minutes to the one card that takes those instead.
 */
function Cards({ scope, live = false }: { scope: SiteScope; live?: boolean }) {
  return (
    <SiteScopeProvider scope={scope}>
      <CommandDeck
        data={[]}
        stats={{ pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null }}
        metric="visitors"
        onMetricChange={noop}
        interval="day"
        live={live}
        dateRange={range}
        multiDayInterval="day"
        setMultiDayInterval={noop}
      />
      <Sources referrers={[]} siteId="site-1" dateRange={range} live={live} />
      <Audience countries={[]} cities={[]} regions={[]} languages={[]} timezones={[]} siteId="site-1" dateRange={range} live={live} />
      <TechSpecs browsers={[]} os={[]} devices={[]} screenResolutions={[]} siteId="site-1" dateRange={range} live={live} />
      <ContentStats topPages={[]} entryPages={[]} exitPages={[]} domain="haldencycles.example" siteId="site-1" dateRange={range} live={live} />
      <ContentSignals goalCounts={[]} siteId="site-1" dateRange={range} liveMinutes={live ? 5 : undefined} />
      <Outbound siteId="site-1" dateRange={range} live={live} />
    </SiteScopeProvider>
  )
}

/**
 * Every link and every word a reader could meet while opening every tab of every card,
 * once each. The walk renders seven real cards and clicks every tab of every one, so it is
 * done once per scope and shared by the assertions about it.
 */
const walks = new Map<SiteScope, ReturnType<typeof walkOnce>>()
function walk(scope: SiteScope) {
  let seen = walks.get(scope)
  if (!seen) {
    seen = walkOnce(scope)
    walks.set(scope, seen)
  }
  return seen
}
function walkOnce(scope: SiteScope, live = false) {
  const hrefs = new Set<string>()
  const text = new Set<string>()
  const headings = new Set<string>()
  const buttons = new Set<string>()
  const { container, unmount } = render(<Cards scope={scope} live={live} />)
  const scan = () => {
    container.querySelectorAll('a[href]').forEach((a) => hrefs.add(a.getAttribute('href') ?? ''))
    container.querySelectorAll('h3, p').forEach((n) => text.add((n.textContent ?? '').trim()))
    container.querySelectorAll('h3').forEach((n) => headings.add((n.textContent ?? '').trim()))
    container.querySelectorAll('button, a').forEach((n) => buttons.add((n.textContent ?? '').trim()))
  }
  scan()
  const radios = screen.getAllByRole('radio').length
  for (let i = 0; i < radios; i++) {
    fireEvent.click(screen.getAllByRole('radio')[i])
    scan()
  }
  unmount()
  return { hrefs, text, headings, buttons }
}

// Seven real cards, every tab of each: slow on a loaded machine.
const WALK_TIMEOUT = 60_000

/**
 * What an empty card says to a member and to nobody else (components/dashboard/CardEmptyState.tsx): advice about the
 * range, and the two docs links of the blocks that stay empty until the customer does something.
 */
const MEMBER_LINE = 'Try a longer range.'
const MEMBER_LINKS = ['How to send events', 'How to tag links']
/** Every label an empty card has ever offered, to anyone. */
const EVERY_ACTION = [...MEMBER_LINKS, 'Install tracking script', 'Read the docs', 'Open site settings', 'Clear filter', 'Set up →', 'Check the snippet →']

beforeEach(() => {
  cleanup()
  h.usePagePreview.mockReset().mockReturnValue({ data: undefined })
})

describe('a member\'s empty cards say what is true and offer at most a docs link (the control)', () => {
  it('advises a longer range and links to the two docs pages, and nowhere else', () => {
    const seen = walk(memberScope('site-1'))
    // Without these the absences asserted for a public view below would hold for a walk that never reached a card.
    expect(seen.text.has(MEMBER_LINE)).toBe(true)
    for (const label of MEMBER_LINKS) expect(seen.buttons.has(label), label).toBe(true)
    expect(seen.text.has('No visits in this range')).toBe(true)
    // 🔴 No card offers to install the script any more (owner ruling R11, 14-11-2026): six did, on sites whose
    // script had reported for months. The install prompt is the banner's alone.
    expect(seen.buttons.has('Install tracking script')).toBe(false)
    expect([...seen.hrefs].filter((href) => /settings/.test(href))).toEqual([])
    // The only links are the two docs pages.
    expect([...seen.hrefs].every((href) => /^https:\/\/docs\.ciphera\.net\/pulse\//.test(href)), [...seen.hrefs].join(' ')).toBe(true)
  }, WALK_TIMEOUT)
})

describe('realtime: every empty card reads the one realtime line', () => {
  it('says it in every card and on every tab, and never advises a longer range', () => {
    // The window is always the last five minutes: "Try a longer range." is no advice there, and a card that kept its
    // own heading would sit beside five that say nobody is on the site. The scroll depth tab did exactly that.
    const seen = walkOnce(memberScope('site-1'), true)
    expect([...seen.headings]).toEqual(['Nobody on the site in the last 5 minutes.'])
    expect(seen.text.has(MEMBER_LINE)).toBe(false)
    expect([...seen.hrefs]).toEqual([])
    // The control: the same walk out of realtime meets each card's own heading and the advice.
    const calm = walk(memberScope('site-1'))
    expect(calm.headings.size).toBeGreaterThan(4)
    expect(calm.headings.has('No scroll depth in this range')).toBe(true)
    expect(calm.text.has(MEMBER_LINE)).toBe(true)
  }, WALK_TIMEOUT)
})

describe.each([
  ['the demo', demoScope],
  ['a share link', shareScope],
])('%s: an empty card says its heading, and nothing else', (_name, scope) => {
  it('links nowhere: not to settings, not to Visitors, not to the docs, not anywhere', () => {
    const { hrefs } = walk(scope)
    for (const href of hrefs) {
      expect(href, href).not.toMatch(/settings|visitors/i)
    }
    // The cards hold no link at all while empty: the empty states were the only ones.
    expect([...hrefs]).toEqual([])
  }, WALK_TIMEOUT)

  it('offers no call to action', () => {
    const { buttons } = walk(scope)
    for (const label of EVERY_ACTION) {
      expect(buttons.has(label), label).toBe(false)
    }
  }, WALK_TIMEOUT)

  it('does not advise the reader, who cannot change the site', () => {
    const { text } = walk(scope)
    expect(text.has(MEMBER_LINE)).toBe(false)
    // …and says what is true instead.
    expect(text.has('No visits in this range')).toBe(true)
    expect(text.has('No page views in this range')).toBe(true)
  }, WALK_TIMEOUT)
})

describe('CardEmptyState under a scope', () => {
  const docs = { label: 'How to send events', href: 'https://docs.ciphera.net/pulse/custom-events' }

  it('keeps the whole empty state for a member, and for a page outside any scope', () => {
    for (const scope of [memberScope('site-1'), null]) {
      const state = <CardEmptyState title="No events in this range" fresh="Events your site sends are counted here." docs={docs} />
      const { unmount } = render(scope ? <SiteScopeProvider scope={scope}>{state}</SiteScopeProvider> : state)
      expect(screen.getByText('No events in this range')).toBeTruthy()
      expect(screen.getByText('Try a longer range.')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'How to send events' }).getAttribute('href')).toBe(docs.href)
      unmount()
    }
  })

  it('drops the line and the link in a public view: the heading alone', () => {
    for (const scope of [demoScope, shareScope]) {
      const { unmount } = render(
        <SiteScopeProvider scope={scope}>
          <CardEmptyState title="No events in this range" fresh="Events your site sends are counted here." docs={docs} />
        </SiteScopeProvider>,
      )
      expect(screen.getByText('No events in this range')).toBeTruthy()
      expect(screen.queryByText('Try a longer range.')).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
      unmount()
    }
  })

  it('reads the one realtime line in realtime mode, in every scope', () => {
    for (const scope of [memberScope('site-1'), demoScope]) {
      const { unmount } = render(
        <SiteScopeProvider scope={scope}>
          <CardEmptyState live title="No page views in this range" fresh="Your pages are listed here by how often they are viewed." docs={docs} />
        </SiteScopeProvider>,
      )
      expect(screen.getByText('Nobody on the site in the last 5 minutes.')).toBeTruthy()
      expect(screen.queryByText('No page views in this range')).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
      unmount()
    }
  })
})

describe('ContentSignals reads the page capture through the public endpoint wherever the reader is not a member', () => {
  const read = (scope: SiteScope | null, memberFeatures?: boolean) => {
    h.usePagePreview.mockClear()
    const card = <ContentSignals goalCounts={[]} siteId="site-1" dateRange={range} memberFeatures={memberFeatures} />
    render(scope ? <SiteScopeProvider scope={scope}>{card}</SiteScopeProvider> : card)
    const call = h.usePagePreview.mock.calls[0]
    cleanup()
    return call
  }

  it('asks as a member for a member, and as the public for the demo (whose drill-downs stay on) and a share link', () => {
    expect(read(memberScope('site-1'))).toEqual(['site-1', true])
    expect(read(null)).toEqual(['site-1', true])
    expect(read(demoScope)).toEqual(['site-1', false])
    expect(read(shareScope, false)).toEqual(['site-1', false])
    // The legacy off switch still means "the public endpoint", scope or none.
    expect(read(null, false)).toEqual(['site-1', false])
  })
})
