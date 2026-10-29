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

function Cards({ scope }: { scope: SiteScope }) {
  return (
    <SiteScopeProvider scope={scope}>
      <CommandDeck
        data={[]}
        stats={{ pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null }}
        metric="visitors"
        onMetricChange={noop}
        interval="day"
        dateRange={range}
        multiDayInterval="day"
        setMultiDayInterval={noop}
      />
      <Sources referrers={[]} siteId="site-1" dateRange={range} />
      <Audience countries={[]} cities={[]} regions={[]} languages={[]} timezones={[]} siteId="site-1" dateRange={range} />
      <TechSpecs browsers={[]} os={[]} devices={[]} screenResolutions={[]} siteId="site-1" dateRange={range} />
      <ContentStats topPages={[]} entryPages={[]} exitPages={[]} domain="haldencycles.example" siteId="site-1" dateRange={range} />
      <ContentSignals goalCounts={[]} siteId="site-1" dateRange={range} />
      <Outbound siteId="site-1" dateRange={range} />
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
function walkOnce(scope: SiteScope) {
  const hrefs = new Set<string>()
  const text = new Set<string>()
  const buttons = new Set<string>()
  const { container, unmount } = render(<Cards scope={scope} />)
  const scan = () => {
    container.querySelectorAll('a[href]').forEach((a) => hrefs.add(a.getAttribute('href') ?? ''))
    container.querySelectorAll('h3, p').forEach((n) => text.add((n.textContent ?? '').trim()))
    container.querySelectorAll('button, a').forEach((n) => buttons.add((n.textContent ?? '').trim()))
  }
  scan()
  const radios = screen.getAllByRole('radio').length
  for (let i = 0; i < radios; i++) {
    fireEvent.click(screen.getAllByRole('radio')[i])
    scan()
  }
  unmount()
  return { hrefs, text, buttons }
}

// Seven real cards, every tab of each: slow on a loaded machine.
const WALK_TIMEOUT = 60_000

/** What an empty card says to the site's owner: every phrase here must be gone from a public view. */
const OWNER_PHRASES = [
  "Nobody's linked to you yet",
  "Your first visitor hasn't arrived",
  'Share your site to get the first data point.',
  'Your most visited pages will rank here',
  'Tag your links with UTM parameters',
  "Add pulse.track('event')",
]
const holds = (text: Set<string>, phrase: string) => [...text].some((t) => t.includes(phrase))

beforeEach(() => {
  cleanup()
  h.usePagePreview.mockReset().mockReturnValue({ data: undefined })
})

describe('a member\'s empty cards point at the way to install, as they always did (the control)', () => {
  it('links to the site settings and offers to install the script', () => {
    const seen = walk(memberScope('site-1'))
    expect(seen.hrefs.has('/settings/site/general')).toBe(true)
    expect(seen.buttons.has('Install tracking script')).toBe(true)
    expect(seen.buttons.has('Read the docs')).toBe(true)
    // …and speaks to the owner everywhere the public view must not: without these, the
    // absences asserted below would hold for a walk that never reached the card.
    for (const phrase of OWNER_PHRASES) expect(holds(seen.text, phrase), phrase).toBe(true)
  }, WALK_TIMEOUT)
})

describe.each([
  ['the demo', demoScope],
  ['a share link', shareScope],
])('%s: an empty card says there is nothing yet, and nothing else', (_name, scope) => {
  it('links nowhere: not to settings, not to Visitors, not anywhere in the app', () => {
    const { hrefs } = walk(scope)
    for (const href of hrefs) {
      expect(href, href).not.toMatch(/settings|visitors/i)
    }
    // The cards hold no link at all while empty: the empty states were the only ones.
    expect([...hrefs]).toEqual([])
  }, WALK_TIMEOUT)

  it('offers no call to action', () => {
    const { buttons } = walk(scope)
    for (const label of ['Install tracking script', 'Read the docs', 'Set up →', 'Check the snippet →']) {
      expect(buttons.has(label), label).toBe(false)
    }
  }, WALK_TIMEOUT)

  it('does not speak to the owner', () => {
    const { text } = walk(scope)
    for (const phrase of OWNER_PHRASES) expect(holds(text, phrase), phrase).toBe(false)
    // …and says what is true instead.
    expect(text.has('No referrers yet')).toBe(true)
    expect(text.has('No visitors yet')).toBe(true)
  }, WALK_TIMEOUT)
})

describe('CardEmptyState', () => {
  const action = { label: 'Install tracking script', href: '/settings/site/general' }

  it('keeps the whole empty state for a member, and for a page outside any scope', () => {
    for (const scope of [memberScope('site-1'), null]) {
      const { unmount } = render(
        scope ? (
          <SiteScopeProvider scope={scope}>
            <CardEmptyState title="Nobody's linked to you yet" publicTitle="No referrers yet" description="Traffic sources appear here." action={action} />
          </SiteScopeProvider>
        ) : (
          <CardEmptyState title="Nobody's linked to you yet" publicTitle="No referrers yet" description="Traffic sources appear here." action={action} />
        ),
      )
      expect(screen.getByText("Nobody's linked to you yet")).toBeTruthy()
      expect(screen.getByText('Traffic sources appear here.')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Install tracking script' })).toBeTruthy()
      unmount()
    }
  })

  it('drops the action and the description in a public view, and names its own title only where asked', () => {
    const { rerender } = render(
      <SiteScopeProvider scope={demoScope}>
        <CardEmptyState title="Waiting for page views" description="Your most visited pages will rank here." action={action} />
      </SiteScopeProvider>,
    )
    expect(screen.getByText('Waiting for page views')).toBeTruthy()
    expect(screen.queryByText(/most visited/)).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()

    rerender(
      <SiteScopeProvider scope={shareScope}>
        <CardEmptyState title="Nobody's linked to you yet" publicTitle="No referrers yet" action={action} />
      </SiteScopeProvider>,
    )
    expect(screen.getByText('No referrers yet')).toBeTruthy()
    expect(screen.queryByText("Nobody's linked to you yet")).toBeNull()
  })

  it('reads the one realtime line in realtime mode, in every scope', () => {
    for (const scope of [memberScope('site-1'), demoScope]) {
      const { unmount } = render(
        <SiteScopeProvider scope={scope}>
          <CardEmptyState live title="Waiting for page views" description="Soon." action={action} />
        </SiteScopeProvider>,
      )
      expect(screen.getByText('Nobody on the site in the last 5 minutes.')).toBeTruthy()
      expect(screen.queryByText('Soon.')).toBeNull()
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
